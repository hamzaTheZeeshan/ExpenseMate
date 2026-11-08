import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Card(models.Model):
    # Maps onto the table Prisma created. Django must never create/alter it.
    # The CHECK constraints (last_four length, expiry_month 1-12) live in the DB.
    id = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False, db_column="id"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        db_column="user_id",
        related_name="cards",
    )
    nickname = models.TextField(db_column="nickname")
    card_type = models.TextField(null=True, blank=True, db_column="card_type")
    last_four = models.TextField(db_column="last_four")
    expiry_month = models.IntegerField(null=True, blank=True, db_column="expiry_month")
    expiry_year = models.IntegerField(null=True, blank=True, db_column="expiry_year")
    balance = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, default=0, db_column="balance"
    )
    credit_limit = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, default=0, db_column="credit_limit"
    )
    credit_used = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, default=0, db_column="credit_used"
    )
    currency = models.TextField(null=True, blank=True, default="USD", db_column="currency")
    color_theme = models.TextField(
        null=True, blank=True, default="#000000", db_column="color_theme"
    )
    is_default = models.BooleanField(null=True, default=False, db_column="is_default")
    created_at = models.DateTimeField(
        null=True, default=timezone.now, db_column="created_at"
    )
    # No auto_now: Node's schema has no @updatedAt, so this never changes
    # after creation. Kept identical on purpose.
    updated_at = models.DateTimeField(
        null=True, default=timezone.now, db_column="updated_at"
    )

    class Meta:
        managed = False
        db_table = "cards"

    def __str__(self):
        return self.nickname