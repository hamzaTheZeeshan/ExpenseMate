import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Budget(models.Model):
    # Maps onto the table Prisma created. Django must never create/alter it.
    # The CHECK on `period` lives in the database.
    id = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False, db_column="id"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        db_column="user_id",
        related_name="budgets",
    )
    # DO_NOTHING on purpose: the database does ON DELETE CASCADE for budgets
    # when a category is deleted. Django must not emulate it.
    category = models.ForeignKey(
        "categories.Category",
        null=True,
        blank=True,
        on_delete=models.DO_NOTHING,
        db_column="category_id",
        related_name="budgets",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, db_column="amount")
    period = models.CharField(max_length=20, default="monthly", db_column="period")
    start_date = models.DateField(db_column="start_date")
    end_date = models.DateField(null=True, blank=True, db_column="end_date")
    created_at = models.DateTimeField(
        null=True, default=timezone.now, db_column="created_at"
    )

    class Meta:
        managed = False
        db_table = "budgets"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "category", "period", "start_date"],
                name="budgets_user_id_category_id_period_start_date_key",
            )
        ]

    def __str__(self):
        return f"{self.period} {self.amount}"


class BudgetAlert(models.Model):
    # Mapped for completeness only. Node has no alert logic yet.
    id = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False, db_column="id"
    )
    # DO_NOTHING: the database cascades budget_alerts when a budget is deleted.
    budget = models.ForeignKey(
        Budget,
        on_delete=models.DO_NOTHING,
        db_column="budget_id",
        related_name="alerts",
    )
    threshold_percent = models.IntegerField(default=80, db_column="threshold_percent")
    triggered_at = models.DateTimeField(null=True, blank=True, db_column="triggered_at")
    is_read = models.BooleanField(null=True, default=False, db_column="is_read")
    created_at = models.DateTimeField(
        null=True, default=timezone.now, db_column="created_at"
    )

    class Meta:
        managed = False
        db_table = "budget_alerts"

    def __str__(self):
        return f"{self.threshold_percent}%"