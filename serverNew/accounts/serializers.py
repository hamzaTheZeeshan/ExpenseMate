import re

from rest_framework import serializers

from common.formatting import iso_datetime
from common.validation import validate_fields

# At least 1 letter + 1 number, min 8 chars (same rule and messages as Joi).
_PASSWORD_RE = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).+\Z", re.ASCII)
_PASSWORD_OPTIONS = {
    "min_length": 8,
    "min_message": "Password must be at least 8 characters",
    "pattern": _PASSWORD_RE,
    "pattern_message": "Password must contain at least one letter and one number",
}


class _JoiStyleSerializer(serializers.Serializer):
    spec = ()

    def to_internal_value(self, data):
        return validate_fields(data, self.spec)


class SignupSerializer(_JoiStyleSerializer):
    spec = [
        ("email", {"email": True}),
        ("password", _PASSWORD_OPTIONS),
        ("full_name", {}),
    ]


class LoginSerializer(_JoiStyleSerializer):
    spec = [("email", {"email": True}), ("password", {})]


class ForgotPasswordSerializer(_JoiStyleSerializer):
    spec = [("email", {"email": True})]


class ResetPasswordSerializer(_JoiStyleSerializer):
    spec = [("token", {}), ("newPassword", _PASSWORD_OPTIONS)]


class GoogleAuthSerializer(_JoiStyleSerializer):
    spec = [("idToken", {})]


def to_safe_user(user):
    """Same JSON as toSafeUser(): no password hash, no reset token fields."""
    if user is None:
        return None
    return {
        "id": str(user.id),
        "email": user.email,
        "provider": user.provider,
        "googleId": user.google_id,
        "fullName": user.full_name,
        "avatarUrl": user.avatar_url,
        "currency": user.currency,
        "isEmailVerified": user.is_email_verified,
        "createdAt": iso_datetime(user.created_at),
        "updatedAt": iso_datetime(user.updated_at),
    }