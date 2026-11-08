import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Transaction(models.Model):
    # Maps onto the table Prisma created. Django must never create/alter it.
    # The CHECK on `type` lives in the database.
    id = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False, db_column="id"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        db_column="user_id",
        related_name="transactions",
    )
    # DO_NOTHING on purpose: the database does ON DELETE SET NULL for both
    # card_id and category_id. Django must not emulate it.
    card = models.ForeignKey(
        "cards.Card",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        db_column="card_id",
        related_name="transactions",
    )
    category = models.ForeignKey(
        "categories.Category",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        db_column="category_id",
        related_name="transactions",
    )
    type = models.CharField(max_length=20, db_column="type")
    amount = models.DecimalField(max_digits=12, decimal_places=2, db_column="amount")
    merchant = models.TextField(null=True, blank=True, db_column="merchant")
    note = models.TextField(null=True, blank=True, db_column="note")
    occurred_at = models.DateTimeField(default=timezone.now, db_column="occurred_at")
    created_at = models.DateTimeField(
        null=True, default=timezone.now, db_column="created_at"
    )

    class Meta:
        managed = False
        db_table = "transactions"

    def __str__(self):
        return f"{self.type} {self.amount}"