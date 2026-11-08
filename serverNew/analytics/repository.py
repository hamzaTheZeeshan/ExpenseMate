from datetime import timezone as dt_timezone

from django.db.models import F, Sum
from django.db.models.functions import TruncDay, TruncMonth, TruncWeek
from django.utils import timezone

from common.dates import add_months
from transactions.models import Transaction

# Allowlist: the unit is chosen from this dict, never interpolated from input.
GRANULARITY_TRUNCS = {"day": TruncDay, "week": TruncWeek, "month": TruncMonth}


def _local_now():
    now = timezone.now()
    return timezone.localtime(now) if timezone.is_aware(now) else now


def _in_range(user_id, start, end, **extra):
    # [start, end): inclusive start, EXCLUSIVE end.
    return Transaction.objects.filter(
        user_id=user_id, occurred_at__gte=start, occurred_at__lt=end, **extra
    )


def _sum_by_category(queryset):
    rows = (
        queryset.values("category_id")
        .annotate(total=Sum("amount"))
        .order_by(F("category_id").asc(nulls_last=True))
    )
    return [
        {
            "category_id": str(row["category_id"]) if row["category_id"] else None,
            "total": row["total"],
        }
        for row in rows
    ]


def spending_by_category(user_id, start_date, end_date):
    """Expense totals per category in [start, end). Rows: {category_id|None, total Decimal}."""
    return _sum_by_category(_in_range(user_id, start_date, end_date, type="expense"))


def spending_over_time(user_id, start_date, end_date, granularity):
    """
    Expense totals bucketed by day/week/month in [start, end), ascending.
    Buckets are cut in UTC explicitly (AT TIME ZONE 'UTC'), so they do not
    depend on the session timezone. Weeks start on Monday, as in Postgres.
    """
    trunc = GRANULARITY_TRUNCS.get(granularity, TruncDay)
    rows = (
        _in_range(user_id, start_date, end_date, type="expense")
        .annotate(period=trunc("occurred_at", tzinfo=dt_timezone.utc))
        .values("period")
        .annotate(total=Sum("amount"))
        .order_by("period")
    )
    return [{"period": row["period"], "amount": float(row["total"] or 0)} for row in rows]


def income_vs_expense(user_id, start_date, end_date):
    """{"income": float, "expense": float} for [start, end)."""
    rows = (
        _in_range(user_id, start_date, end_date)
        .values("type")
        .annotate(total=Sum("amount"))
        .order_by("type")
    )
    totals = {row["type"]: row["total"] for row in rows}
    return {
        "income": float(totals.get("income") or 0),
        "expense": float(totals.get("expense") or 0),
    }


def average_spend_by_category(user_id, months_back):
    """
    Expense total per category over the last `months_back` months divided by
    months_back (flat, not by months that had data). Window is
    [now minus months_back months (JS setMonth overflow), now).
    """
    end = _local_now()
    start = add_months(end, -months_back)
    return [
        {
            "category_id": row["category_id"],
            "average": float(row["total"] or 0) / months_back,
        }
        for row in _sum_by_category(_in_range(user_id, start, end, type="expense"))
    ]