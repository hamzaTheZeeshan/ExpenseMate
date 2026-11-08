import uuid

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Card",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        db_column="id",
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("nickname", models.TextField(db_column="nickname")),
                (
                    "card_type",
                    models.TextField(blank=True, db_column="card_type", null=True),
                ),
                ("last_four", models.TextField(db_column="last_four")),
                (
                    "expiry_month",
                    models.IntegerField(blank=True, db_column="expiry_month", null=True),
                ),
                (
                    "expiry_year",
                    models.IntegerField(blank=True, db_column="expiry_year", null=True),
                ),
                (
                    "balance",
                    models.DecimalField(
                        db_column="balance",
                        decimal_places=2,
                        default=0,
                        max_digits=12,
                        null=True,
                    ),
                ),
                (
                    "credit_limit",
                    models.DecimalField(
                        db_column="credit_limit",
                        decimal_places=2,
                        default=0,
                        max_digits=12,
                        null=True,
                    ),
                ),
                (
                    "credit_used",
                    models.DecimalField(
                        db_column="credit_used",
                        decimal_places=2,
                        default=0,
                        max_digits=12,
                        null=True,
                    ),
                ),
                (
                    "currency",
                    models.TextField(
                        blank=True, db_column="currency", default="USD", null=True
                    ),
                ),
                (
                    "color_theme",
                    models.TextField(
                        blank=True, db_column="color_theme", default="#000000", null=True
                    ),
                ),
                (
                    "is_default",
                    models.BooleanField(db_column="is_default", default=False, null=True),
                ),
                (
                    "created_at",
                    models.DateTimeField(
                        db_column="created_at",
                        default=django.utils.timezone.now,
                        null=True,
                    ),
                ),
                (
                    "updated_at",
                    models.DateTimeField(
                        db_column="updated_at",
                        default=django.utils.timezone.now,
                        null=True,
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        db_column="user_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="cards",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "cards",
                "managed": False,
            },
        ),
    ]