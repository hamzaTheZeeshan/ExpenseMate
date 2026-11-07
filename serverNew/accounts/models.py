import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models
from django.utils import timezone

from accounts.passwords import hash_password


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        """
        `password` is the PLAIN password. It is hashed here with bcrypt
        (same format and rounds as the Node app). Google users pass no
        password and are stored with password = NULL.
        Django's set_password() is NOT used on purpose.
        The email is stored exactly as given, like Node did.
        """
        if not email:
            raise ValueError("Email is required")
        user = self.model(email=email, **extra_fields)
        user.password = hash_password(password) if password else None
        user.save(using=self._db)
        return user


class User(AbstractBaseUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.CharField(max_length=255, unique=True)
    # Django's default "password" field is mapped to your existing password_hash column
    password = models.CharField(max_length=255, null=True, blank=True, db_column="password_hash")
    provider = models.CharField(max_length=20, default="local")
    google_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    full_name = models.CharField(max_length=255, null=True, blank=True)
    avatar_url = models.TextField(null=True, blank=True)
    currency = models.CharField(max_length=10, null=True, blank=True, default="USD")
    is_email_verified = models.BooleanField(null=True, default=False)
    reset_password_token = models.TextField(null=True, blank=True)
    reset_password_expires = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, default=timezone.now)
    updated_at = models.DateTimeField(null=True, auto_now=True)

    # Your table has no last_login column, so we remove that field
    last_login = None

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        db_table = "users"
        managed = False

    def __str__(self):
        return self.email