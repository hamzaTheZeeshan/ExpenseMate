import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Category(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="categories",
    )
    name = models.CharField(max_length=255)
    icon = models.CharField(max_length=255, null=True, blank=True)
    color = models.CharField(max_length=50, null=True, blank=True)
    is_default = models.BooleanField(null=True, default=False)
    created_at = models.DateTimeField(null=True, default=timezone.now)

    class Meta:
        db_table = "categories"
        managed = False
        unique_together = [("user", "name")]

    def __str__(self):
        return self.name