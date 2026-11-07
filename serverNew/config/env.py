import os
import re
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def required(name):
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def parse_duration(value):
    """Turns '15m', '7d', '2h', '30s' into a timedelta, like Node's jsonwebtoken."""
    match = re.fullmatch(r"(\d+)\s*([smhd])", value.strip())
    if not match:
        raise RuntimeError(
            f"Invalid duration '{value}'. Use formats like 30s, 15m, 2h, 7d."
        )
    units = {"s": "seconds", "m": "minutes", "h": "hours", "d": "days"}
    return timedelta(**{units[match.group(2)]: int(match.group(1))})


class Env:
    debug = os.getenv("DEBUG", "False") == "True"
    allowed_hosts = [
        h.strip()
        for h in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
        if h.strip()
    ]
    client_url = os.getenv("CLIENT_URL", "http://localhost:5173")

    django_secret_key = required("DJANGO_SECRET_KEY")
    database_url = required("DATABASE_URL")

    jwt_access_secret = required("JWT_ACCESS_SECRET")
    jwt_refresh_secret = required("JWT_REFRESH_SECRET")
    jwt_access_expires_in = parse_duration(os.getenv("JWT_ACCESS_EXPIRES_IN", "15m"))
    jwt_refresh_expires_in = parse_duration(os.getenv("JWT_REFRESH_EXPIRES_IN", "7d"))

    bcrypt_salt_rounds = int(os.getenv("BCRYPT_SALT_ROUNDS", "12"))

    google_client_id = os.getenv("GOOGLE_CLIENT_ID", "")


env = Env()