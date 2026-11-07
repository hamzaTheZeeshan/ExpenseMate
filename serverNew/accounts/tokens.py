from datetime import datetime, timezone

import jwt

from config.env import env

ALGORITHM = "HS256"  # jsonwebtoken's default
LEEWAY_SECONDS = 10  # tolerate small clock differences with tokens Node issued


def _sign(payload, secret, lifetime):
    now = datetime.now(timezone.utc)
    claims = {**payload, "iat": now, "exp": now + lifetime}
    return jwt.encode(claims, secret, algorithm=ALGORITHM)


def _verify(token, secret):
    return jwt.decode(token, secret, algorithms=[ALGORITHM], leeway=LEEWAY_SECONDS)


def sign_access_token(payload):
    return _sign(payload, env.jwt_access_secret, env.jwt_access_expires_in)


def sign_refresh_token(payload):
    return _sign(payload, env.jwt_refresh_secret, env.jwt_refresh_expires_in)


# Both raise jwt.PyJWTError on an invalid or expired token.
def verify_access_token(token):
    return _verify(token, env.jwt_access_secret)


def verify_refresh_token(token):
    return _verify(token, env.jwt_refresh_secret)