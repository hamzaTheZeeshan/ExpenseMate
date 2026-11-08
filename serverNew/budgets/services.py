import math
from datetime import datetime, time, timedelta
from datetime import timezone as dt_timezone

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from categories.services import find_category_by_id
from common.dates import compute_period_end  # <- adjust if your file is named differently
from common.errors import AppError
from transactions.services import sum_expenses_for_category_in_range

from .models import Budget

UNIQUE_VIOLATION_SQLSTATE = "23505"
DUPLICATE_MESSAGE = (
    "A budget for this category and period already exists starting on this date"
)


# --- Lookups (public: find_budget_by_id, get_budgets) ---


def find_budget_by_id(budget_id):
    """Returns the Budget (with category loaded) or None. No ownership check."""
    try:
        return Budget.objects.select_related("category").filter(pk=budget_id).first()
    except (DjangoValidationError, ValueError):
        # Malformed UUID: treat as "not found".
        return None


def _active_bounds():
    """
    Prisma compares the date columns with the current instant, so a date
    means midnight UTC of that day:
      start_date <= now  <=>  start_date <= today (UTC)
      end_date   >= now  <=>  end_date > today, unless now is exactly midnight
    """
    now = timezone.now().astimezone(dt_timezone.utc)
    today = now.date()
    end_threshold = today if now.time() == time.min else today + timedelta(days=1)
    return today, end_threshold


def _filtered(user_id, filters):
    queryset = Budget.objects.filter(user_id=user_id)
    if filters.get("category_id"):
        queryset = queryset.filter(category_id=filters["category_id"])
    if filters.get("period"):
        queryset = queryset.filter(period=filters["period"])
    if filters.get("active"):
        today, end_threshold = _active_bounds()
        queryset = queryset.filter(start_date__lte=today).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=end_threshold)
        )
    return queryset


# --- Progress ---


def _midnight_utc(value):
    return datetime(value.year, value.month, value.day, tzinfo=dt_timezone.utc)


def _js_number(value):
    """JSON-wise, JavaScript prints 25.0 as 25."""
    return int(value) if isinstance(value, float) and value.is_integer() else value


def _attach_progress(budget):
    """
    Port of withProgress. Sets .spent, .remaining and .percent_used on the
    instance. Expenses only, occurred_at >= start and < end (EXCLUSIVE end, so
    an explicit end_date day itself is not counted). Copied exactly.
    """
    start = _midnight_utc(budget.start_date)
    if budget.end_date is not None:
        end = _midnight_utc(budget.end_date)
    else:
        end = compute_period_end(start, budget.period)

    spent = sum_expenses_for_category_in_range(
        budget.user_id, budget.category_id, start, end
    )

    amount = float(budget.amount)
    remaining = amount - spent
    # JavaScript Math.round: round half up, not Python's banker's rounding.
    percent_used = math.floor(spent / amount * 100 + 0.5) if amount > 0 else 0

    budget.spent = _js_number(spent)
    budget.remaining = _js_number(remaining)
    budget.percent_used = int(percent_used)
    return budget


def get_budgets(user_id, filters=None):
    """
    Budgets for the user (filters: category_id, period, active), start_date
    newest first, each with .category loaded and .spent / .remaining /
    .percent_used attached. Serialize with BudgetWithProgressSerializer.
    """
    queryset = _filtered(user_id, filters or {})
    budgets = queryset.select_related("category").order_by("-start_date", "id")
    return [_attach_progress(budget) for budget in budgets]


# --- Ownership checks ---


def _assert_category_accessible(user_id, category_id):
    category = find_category_by_id(category_id)
    if category is None:
        raise AppError("Category not found", 404)
    # Global default categories (user is null) are usable by everyone.
    if category.user_id is not None and str(category.user_id) != str(user_id):
        raise AppError("You don't have permission to use this category", 403)
    return category


def _assert_owned(user_id, budget_id):
    budget = find_budget_by_id(budget_id)
    if budget is None:
        raise AppError("Budget not found", 404)
    if str(budget.user_id) != str(user_id):
        raise AppError("You don't have permission to access this budget", 403)
    return budget


def _is_unique_violation(exc):
    cause = exc.__cause__
    code = getattr(cause, "pgcode", None) or getattr(cause, "sqlstate", None)
    return code == UNIQUE_VIOLATION_SQLSTATE


# --- Use cases ---


def get_budget_by_id(user_id, budget_id):
    return _attach_progress(_assert_owned(user_id, budget_id))


def create_budget(user_id, data):
    _assert_category_accessible(user_id, data["category_id"])

    try:
        # atomic() is a savepoint, so the connection stays usable after a failure.
        with transaction.atomic():
            created = Budget.objects.create(user_id=user_id, **data)
    except IntegrityError as exc:
        if _is_unique_violation(exc):
            raise AppError(DUPLICATE_MESSAGE, 409)
        raise

    # Raw record with nested category, NO progress (as in Node).
    return find_budget_by_id(created.pk)


def update_budget(user_id, budget_id, data):
    budget = _assert_owned(user_id, budget_id)

    if "category_id" in data:
        _assert_category_accessible(user_id, data["category_id"])

    try:
        with transaction.atomic():
            for field, value in data.items():
                setattr(budget, field, value)
            budget.save(update_fields=list(data.keys()))
    except IntegrityError as exc:
        if _is_unique_violation(exc):
            raise AppError(DUPLICATE_MESSAGE, 409)
        raise

    return find_budget_by_id(budget.pk)


def delete_budget(user_id, budget_id):
    budget = _assert_owned(user_id, budget_id)
    # budget_alerts rows cascade-delete in the database.
    budget.delete()