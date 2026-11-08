import uuid

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("categories", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Budget",
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
                (
                    "amount",
                    models.DecimalField(
                        db_column="amount", decimal_places=2, max_digits=12
                    ),
                ),
                (
                    "period",
                    models.CharField(
                        db_column="period", default="monthly", max_length=20
                    ),
                ),
                ("start_date", models.DateField(db_column="start_date")),
                (
                    "end_date",
                    models.DateField(blank=True, db_column="end_date", null=True),
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
                    "category",
                    models.ForeignKey(
                        blank=True,
                        db_column="category_id",
                        null=True,
                        on_delete=django.db.models.deletion.DO_NOTHING,
                        related_name="budgets",
                        to="categories.category",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        db_column="user_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="budgets",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "budgets",
                "managed": False,
            },
        ),
        migrations.CreateModel(
            name="BudgetAlert",
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
                (
                    "threshold_percent",
                    models.IntegerField(db_column="threshold_percent", default=80),
                ),
                (
                    "triggered_at",
                    models.DateTimeField(
                        blank=True, db_column="triggered_at", null=True
                    ),
                ),
                (
                    "is_read",
                    models.BooleanField(db_column="is_read", default=False, null=True),
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
                    "budget",
                    models.ForeignKey(
                        db_column="budget_id",
                        on_delete=django.db.models.deletion.DO_NOTHING,
                        related_name="alerts",
                        to="budgets.budget",
                    ),
                ),
            ],
            options={
                "db_table": "budget_alerts",
                "managed": False,
            },
        ),
        migrations.AddConstraint(
            model_name="budget",
            constraint=models.UniqueConstraint(
                fields=("user", "category", "period", "start_date"),
                name="budgets_user_id_category_id_period_start_date_key",
            ),
        ),
    ]