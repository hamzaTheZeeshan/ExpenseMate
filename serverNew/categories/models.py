import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Category(models.Model):
    # Maps onto the table Prisma created. Django must never create/alter it.
    id = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False, db_column="id"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        db_column="user_id",
        related_name="categories",
    )
    name = models.TextField(db_column="name")
    icon = models.TextField(null=True, blank=True, db_column="icon")
    color = models.TextField(null=True, blank=True, db_column="color")
    is_default = models.BooleanField(null=True, default=False, db_column="is_default")
    created_at = models.DateTimeField(
        null=True, default=timezone.now, db_column="created_at"
    )

    class Meta:
        managed = False
        db_table = "categories"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name"], name="categories_user_id_name_key"
            )
        ]

    def __str__(self):
        return self.name