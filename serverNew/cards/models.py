import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Card(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cards",
    )
    nickname = models.CharField(max_length=255)
    card_type = models.CharField(max_length=50, null=True, blank=True)
    last_four = models.CharField(max_length=4)
    expiry_month = models.IntegerField(null=True, blank=True)
    expiry_year = models.IntegerField(null=True, blank=True)
    balance = models.DecimalField(max_digits=12, decimal_places=2, null=True, default=0)
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, null=True, default=0)
    credit_used = models.DecimalField(max_digits=12, decimal_places=2, null=True, default=0)
    currency = models.CharField(max_length=10, null=True, blank=True, default="USD")
    color_theme = models.CharField(max_length=50, null=True, blank=True, default="#000000")
    is_default = models.BooleanField(null=True, default=False)
    created_at = models.DateTimeField(null=True, default=timezone.now)
    updated_at = models.DateTimeField(null=True, auto_now=True)

    class Meta:
        db_table = "cards"
        managed = False

    def __str__(self):
        return f"{self.nickname} (****{self.last_four})"