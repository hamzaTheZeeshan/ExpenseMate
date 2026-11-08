import math

from django.utils import timezone

from categories.services import get_categories
from common.dates import add_days
from common.formatting import iso_datetime

from . import repository

RADAR_MONTHS_BACK = 6
DEFAULT_SPENDING_OVER_TIME_DAYS = 30
UNCATEGORIZED = "Uncategorized"


# --- Date helpers ---
# Node used the SERVER's local timezone. Django's "local" timezone is the
# TIME_ZONE setting (with USE_TZ = True). Matching Node therefore means
# TIME_ZONE must equal the timezone the Node server ran in.


def _now():
    now = timezone.now()
    return timezone.localtime(now) if timezone.is_aware(now) else now


def _to_local(value):
    return timezone.localtime(value) if timezone.is_aware(value) else value


def start_of_current_month(now=None):
    now = now or _now()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def start_of_next_month(now=None):
    now = now or _now()
    year, month = (now.year + 1, 1) if now.month == 12 else (now.year, now.month + 1)
    return now.replace(
        year=year, month=month, day=1, hour=0, minute=0, second=0, microsecond=0
    )


def round_currency(amount):
    """JavaScript Math.round(x * 100) / 100: round half up, not banker's rounding."""
    return math.floor(amount * 100 + 0.5) / 100


def _json_number(value):
    """JavaScript prints 25.0 as 25."""
    return int(value) if isinstance(value, float) and value.is_integer() else value


def _money(value):
    return _json_number(round_currency(value))


def _categories_by_id(user_id):
    # The user's categories plus global defaults.
    return {str(category.id): category for category in get_categories(user_id)}


def _category_name(category):
    return category.name if category is not None else UNCATEGORIZED


# --- Use cases ---


def get_spending_by_category(user_id, start_date=None, end_date=None):
    range_start = start_date if start_date is not None else start_of_current_month()
    range_end = end_date if end_date is not None else start_of_next_month()

    rows = repository.spending_by_category(user_id, range_start, range_end)
    by_id = _categories_by_id(user_id)

    result = []
    for row in rows:
        category = by_id.get(row["category_id"]) if row["category_id"] else None
        result.append(
            {
                "category_id": row["category_id"],
                "name": _category_name(category),
                "color": category.color if category is not None else None,
                "amount": _money(float(row["total"] or 0)),
            }
        )
    return result


def get_spending_over_time(user_id, start_date=None, end_date=None, granularity=None):
    range_end = end_date if end_date is not None else _now()
    range_start = (
        start_date
        if start_date is not None
        else add_days(_to_local(range_end), -DEFAULT_SPENDING_OVER_TIME_DAYS)
    )
    unit = granularity or "day"

    rows = repository.spending_over_time(user_id, range_start, range_end, unit)
    return [
        {"period": iso_datetime(row["period"]), "amount": _money(row["amount"])}
        for row in rows
    ]


def get_income_vs_expense(user_id, start_date=None, end_date=None):
    """Public (used by the dashboard). No dates means the current month."""
    range_start = start_date if start_date is not None else start_of_current_month()
    range_end = end_date if end_date is not None else start_of_next_month()

    totals = repository.income_vs_expense(user_id, range_start, range_end)
    income, expense = totals["income"], totals["expense"]
    return {
        "income": _money(income),
        "expense": _money(expense),
        "net": _money(income - expense),
    }


def get_spending_radar(user_id):
    now = _now()
    range_start = start_of_current_month(now)
    range_end = start_of_next_month(now)

    this_month = {
        row["category_id"]: float(row["total"] or 0)
        for row in repository.spending_by_category(user_id, range_start, range_end)
    }
    average = {
        row["category_id"]: row["average"]
        for row in repository.average_spend_by_category(user_id, RADAR_MONTHS_BACK)
    }
    by_id = _categories_by_id(user_id)

    # Deterministic order: category_id ascending, nulls last.
    category_ids = sorted(
        set(this_month) | set(average), key=lambda cid: (cid is None, cid or "")
    )

    result = []
    for category_id in category_ids:
        category = by_id.get(category_id) if category_id else None
        result.append(
            {
                "category_id": category_id,
                "name": _category_name(category),
                "this_period": _money(this_month.get(category_id, 0)),
                "average": _money(average.get(category_id, 0)),
            }
        )
    return result