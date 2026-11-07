import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Transaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="transactions",
    )
    card = models.ForeignKey(
        "cards.Card",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transactions",
    )
    category = models.ForeignKey(
        "categories.Category",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transactions",
    )
    type = models.CharField(max_length=20)  # 'income' or 'expense'
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    merchant = models.CharField(max_length=255, null=True, blank=True)
    note = models.TextField(null=True, blank=True)
    occurred_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(null=True, default=timezone.now)

    class Meta:
        db_table = "transactions"
        managed = False

    def __str__(self):
        return f"{self.type} {self.amount}"