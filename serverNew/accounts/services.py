import hashlib
import logging
import secrets
import uuid
from datetime import timedelta

import jwt
from django.utils import timezone
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from accounts.models import User
from accounts.passwords import hash_password, verify_password
from accounts.tokens import (
    sign_access_token,
    sign_refresh_token,
    verify_refresh_token,
)
from common.errors import AppError
from config.env import env

logger = logging.getLogger(__name__)


# ---------- "repository" helpers (Prisma -> ORM) ----------

def find_user_by_id(user_id):
    """Returns the user, or None (also None if the id is not a valid UUID)."""
    try:
        parsed = uuid.UUID(str(user_id))
    except (ValueError, AttributeError, TypeError):
        return None
    return User.objects.filter(id=parsed).first()


def find_user_by_email(email):
    return User.objects.filter(email=email).first()


def find_user_by_google_id(google_id):
    return User.objects.filter(google_id=google_id).first()


def _hash_reset_token(raw_token):
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _issue_tokens(user):
    payload = {"sub": str(user.id), "email": user.email}
    return {
        "user": user,
        "access_token": sign_access_token(payload),
        "refresh_token": sign_refresh_token(payload),
    }


# ---------- auth.service.js ----------

def signup(email, password, full_name):
    if find_user_by_email(email):
        raise AppError("An account with this email already exists", 409)

    user = User.objects.create_user(
        email=email,
        password=password,
        full_name=full_name,
        provider="local",
    )
    return _issue_tokens(user)


def login(email, password):
    user = find_user_by_email(email)
    if not user:
        raise AppError("Invalid email or password", 401)

    if user.provider != "local":
        raise AppError(
            f"This account uses {user.provider} sign-in. Please continue with {user.provider}.",
            400,
        )

    if not verify_password(password, user.password):
        raise AppError("Invalid email or password", 401)

    return _issue_tokens(user)


def google_auth(id_token):
    if not env.google_client_id:
        raise AppError("Google sign-in is not configured", 500)

    # Like Node, an invalid token raises a plain error (ValueError) that the
    # exception handler turns into a generic 500.
    payload = google_id_token.verify_oauth2_token(
        id_token,
        google_requests.Request(),
        env.google_client_id,
        clock_skew_in_seconds=10,
    )
    if not payload:
        raise AppError("Invalid Google token", 401)

    # Never create or match an account for an email Google says is unverified.
    if payload.get("email_verified") is False:
        raise AppError("Google account email is not verified", 401)

    google_id = payload.get("sub")
    email = payload.get("email")

    # Case A: already linked, normal login.
    user = find_user_by_google_id(google_id)
    if user:
        return _issue_tokens(user)

    # Case B: a password account already owns this email. Do not auto-link.
    existing = find_user_by_email(email)
    if existing and existing.provider == "local":
        raise AppError(
            "An account already exists with this email. Please sign in with your password.",
            409,
        )

    # Case C: brand-new Google-only signup.
    user = User.objects.create_user(
        email=email,
        password=None,
        full_name=payload.get("name"),
        avatar_url=payload.get("picture"),
        provider="google",
        google_id=google_id,
    )
    return _issue_tokens(user)


def refresh_token(token):
    try:
        decoded = verify_refresh_token(token)
    except jwt.PyJWTError:
        raise AppError("Invalid or expired refresh token", 401)

    user = find_user_by_id(decoded.get("sub"))
    if not user:
        raise AppError("User no longer exists", 401)

    access_token = sign_access_token({"sub": str(user.id), "email": user.email})
    return {"access_token": access_token, "user": user}


def forgot_password(email):
    user = find_user_by_email(email)
    # Do not reveal whether the email exists.
    if not user:
        return

    raw_token = secrets.token_hex(32)
    user.reset_password_token = _hash_reset_token(raw_token)
    user.reset_password_expires = timezone.now() + timedelta(hours=1)
    user.save(update_fields=["reset_password_token", "reset_password_expires"])

    # TODO (same as Node): wire up a real email service. For now the link is
    # logged so the flow can be tested.
    reset_link = f"{env.client_url}/reset-password?token={raw_token}"
    logger.info("[auth] Password reset link for %s: %s", email, reset_link)


def reset_password(token, new_password):
    user = User.objects.filter(
        reset_password_token=_hash_reset_token(token),
        reset_password_expires__gt=timezone.now(),
    ).first()

    if not user:
        raise AppError("Reset token is invalid or has expired", 400)

    user.password = hash_password(new_password)
    user.reset_password_token = None
    user.reset_password_expires = None
    user.save(
        update_fields=["password", "reset_password_token", "reset_password_expires"]
    )