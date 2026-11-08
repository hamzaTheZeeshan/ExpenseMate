import uuid

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("cards", "0001_initial"),
        ("categories", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Transaction",
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
                ("type", models.CharField(db_column="type", max_length=20)),
                (
                    "amount",
                    models.DecimalField(
                        db_column="amount", decimal_places=2, max_digits=12
                    ),
                ),
                (
                    "merchant",
                    models.TextField(blank=True, db_column="merchant", null=True),
                ),
                ("note", models.TextField(blank=True, db_column="note", null=True)),
                (
                    "occurred_at",
                    models.DateTimeField(
                        db_column="occurred_at",
                        default=django.utils.timezone.now,
                    ),
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
                    "card",
                    models.ForeignKey(
                        blank=True,
                        db_column="card_id",
                        null=True,
                        on_delete=django.db.models.deletion.DO_NOTHING,
                        related_name="transactions",
                        to="cards.card",
                    ),
                ),
                (
                    "category",
                    models.ForeignKey(
                        blank=True,
                        db_column="category_id",
                        null=True,
                        on_delete=django.db.models.deletion.DO_NOTHING,
                        related_name="transactions",
                        to="categories.category",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        db_column="user_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="transactions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "transactions",
                "managed": False,
            },
        ),
    ]