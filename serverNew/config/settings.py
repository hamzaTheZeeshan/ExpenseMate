from pathlib import Path

import dj_database_url

from config.env import env

BASE_DIR = Path(__file__).resolve().parent.parent

# ---------- Core ----------
SECRET_KEY = env.django_secret_key
DEBUG = env.debug
ALLOWED_HOSTS = env.allowed_hosts

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third party
    "rest_framework",
    "corsheaders",
    "django_filters",
    # your apps
    "common",
    "accounts",
    "categories",
    "cards",
    "transactions",
    "budgets",
    "analytics",
    "dashboard",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ---------- Database (Supabase Postgres) ----------
DATABASES = {
    "default": dj_database_url.parse(
        env.database_url,
        conn_max_age=600,
        ssl_require=True,
    )
}

# ---------- Cache ----------
# DRF throttling stores its request counters in the cache.
# LocMemCache lives in one process's memory: fine for local development.
# On Vercel every serverless instance has its own memory, so limits are
# not shared there. We revisit this in step 10.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "expensemate-throttle",
    }
}

# ---------- Users ----------
AUTH_USER_MODEL = "accounts.User"

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
    "django.contrib.auth.hashers.BCryptPasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

# ---------- CORS / security ----------
CORS_ALLOWED_ORIGINS = [env.client_url.rstrip("/")]
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = [env.client_url.rstrip("/")]

SECURE_CONTENT_TYPE_NOSNIFF = True
if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# ---------- Django REST Framework ----------
REST_FRAMEWORK = {
    # Our own `protect` replacement (Bearer access token, separate secrets)
    "DEFAULT_AUTHENTICATION_CLASSES": ("accounts.authentication.JWTAuthentication",),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend",),
    # JSON only (no browsable HTML API page, no HTML error pages)
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
    # Same inputs Express accepted (json + urlencoded), plus multipart
    # for the CSV upload later (multer)
    "DEFAULT_PARSER_CLASSES": (
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ),
    # Error format and the global rate limit
    "EXCEPTION_HANDLER": "common.exceptions.custom_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": ("common.throttling.ApiRateThrottle",),
}

# ---------- Logging ----------
# Makes the "UNEXPECTED ERROR" log from the exception handler show up in the
# terminal (the equivalent of console.error in Node).
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}

# ---------- Misc ----------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"