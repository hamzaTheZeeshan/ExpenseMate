"""
Analytics use cases (spending by category, over time, income vs expense, radar).

REWRITTEN. The old module was one pile of functions that mixed date helpers,
rounding, category lookups and four use cases, and read the clock and the
repository directly, so nothing could be tested without a database.

Now the logic lives in AnalyticsService, which gets its collaborators (data
repository, category lookup, clock, date formatter) through the constructor.
The module-level get_* functions at the bottom keep the old public interface,
so views.py and the dashboard app keep working unchanged.
"""

from django.utils import timezone

from categories.services import get_categories
from common.dates import add_days
from common.formatting import iso_datetime
from common.money import js_number, money, round_currency  # noqa: F401 (re-exported)

from . import repository

RADAR_MONTHS_BACK = 6
DEFAULT_SPENDING_OVER_TIME_DAYS = 30
DEFAULT_GRANULARITY = "day"
UNCATEGORIZED = "Uncategorized"


# --- Date helpers (kept public: other apps may import them) ---
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


def _null_last(category_id):
    """Sort key: ids ascending, the 'no category' bucket (None) last."""
    return (category_id is None, category_id or "")


class AnalyticsService:
    """All analytics calculations. Pure logic on top of injected collaborators."""

    def __init__(
        self,
        *,
        repo=None,
        categories_for=None,
        clock=None,
        format_datetime=None,
        radar_months_back=RADAR_MONTHS_BACK,
        over_time_days=DEFAULT_SPENDING_OVER_TIME_DAYS,
    ):
        # None means "use the real thing", resolved when the service is built.
        self._repo = repo if repo is not None else repository
        self._categories_for = categories_for or get_categories
        self._clock = clock or _now
        self._format_datetime = format_datetime or iso_datetime
        self._radar_months_back = radar_months_back
        self._over_time_days = over_time_days

    # -- small shared pieces ------------------------------------------------

    def _resolve_range(self, start_date, end_date):
        """Missing bounds default to the current month. The clock is read once."""
        now = self._clock()
        return (
            start_date if start_date is not None else start_of_current_month(now),
            end_date if end_date is not None else start_of_next_month(now),
        )

    def _categories_by_id(self, user_id):
        # The user's categories plus global defaults.
        return {str(c.id): c for c in self._categories_for(user_id)}

    @staticmethod
    def _lookup(by_id, category_id):
        return by_id.get(category_id) if category_id else None

    @staticmethod
    def _name(category):
        return category.name if category is not None else UNCATEGORIZED

    # -- use cases ----------------------------------------------------------

    def spending_by_category(self, user_id, start_date=None, end_date=None):
        start, end = self._resolve_range(start_date, end_date)
        rows = self._repo.spending_by_category(user_id, start, end)
        by_id = self._categories_by_id(user_id)

        result = []
        for row in rows:
            category = self._lookup(by_id, row["category_id"])
            result.append(
                {
                    "category_id": row["category_id"],
                    "name": self._name(category),
                    "color": category.color if category is not None else None,
                    "amount": money(float(row["total"] or 0)),
                }
            )
        return result

    def spending_over_time(
        self, user_id, start_date=None, end_date=None, granularity=None
    ):
        end = end_date if end_date is not None else self._clock()
        start = (
            start_date
            if start_date is not None
            else add_days(_to_local(end), -self._over_time_days)
        )
        rows = self._repo.spending_over_time(
            user_id, start, end, granularity or DEFAULT_GRANULARITY
        )
        return [
            {"period": self._format_datetime(r["period"]), "amount": money(r["amount"])}
            for r in rows
        ]

    def income_vs_expense(self, user_id, start_date=None, end_date=None):
        """Public (used by the dashboard). No dates means the current month."""
        start, end = self._resolve_range(start_date, end_date)
        totals = self._repo.income_vs_expense(user_id, start, end)
        income, expense = totals["income"], totals["expense"]
        return {
            "income": money(income),
            "expense": money(expense),
            "net": money(income - expense),
        }

    def spending_radar(self, user_id):
        """This month's spend vs the average of the last N months, per category."""
        start, end = self._resolve_range(None, None)

        this_month = {
            row["category_id"]: float(row["total"] or 0)
            for row in self._repo.spending_by_category(user_id, start, end)
        }
        average = {
            row["category_id"]: row["average"]
            for row in self._repo.average_spend_by_category(
                user_id, self._radar_months_back
            )
        }
        by_id = self._categories_by_id(user_id)

        result = []
        for category_id in sorted(set(this_month) | set(average), key=_null_last):
            category = self._lookup(by_id, category_id)
            result.append(
                {
                    "category_id": category_id,
                    "name": self._name(category),
                    "this_period": money(this_month.get(category_id, 0)),
                    "average": money(average.get(category_id, 0)),
                }
            )
        return result


# --- Public functions: same names and signatures as before the rewrite ---
# A new service is built per call so the real repository / clock are looked up
# fresh (and so tests can still patch this module if they prefer to).


def get_spending_by_category(user_id, start_date=None, end_date=None):
    return AnalyticsService().spending_by_category(user_id, start_date, end_date)


def get_spending_over_time(user_id, start_date=None, end_date=None, granularity=None):
    return AnalyticsService().spending_over_time(
        user_id, start_date, end_date, granularity
    )


def get_income_vs_expense(user_id, start_date=None, end_date=None):
    return AnalyticsService().income_vs_expense(user_id, start_date, end_date)


def get_spending_radar(user_id):
    return AnalyticsService().spending_radar(user_id)