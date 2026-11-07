from datetime import date, datetime, timedelta

# Ported from utils/date.js. All functions return a new value and never
# change their input. They accept `date` or `datetime` objects.
#
# add_months / add_years deliberately copy JavaScript's overflow behaviour
# so budget periods match the Node app exactly:
#   Jan 31 + 1 month  -> Mar 3 (Mar 2 in a leap year), not Feb 28
#   Feb 29 + 1 year   -> Mar 1


def add_days(value, days):
    return value + timedelta(days=days)


def add_months(value, months):
    total = value.month - 1 + months
    year = value.year + total // 12
    month = total % 12 + 1
    first_of_month = value.replace(year=year, month=month, day=1)
    return first_of_month + timedelta(days=value.day - 1)


def add_years(value, years):
    try:
        return value.replace(year=value.year + years)
    except ValueError:  # Feb 29 landing on a non-leap year
        return value.replace(year=value.year + years, month=3, day=1)


def _coerce(value):
    """Node did new Date(startDate), so accept ISO strings too."""
    if isinstance(value, str):
        if "T" in value or " " in value:
            return datetime.fromisoformat(value)
        return date.fromisoformat(value)
    return value


def compute_period_end(start_date, period):
    """
    Implied end of a budget period ('weekly' | 'monthly' | 'yearly') when the
    budget has no explicit end_date. Computed on read, never saved.
    Unknown periods fall back to monthly, like Node's default case.
    """
    start = _coerce(start_date)

    if period == "weekly":
        return add_days(start, 7)
    if period == "yearly":
        return add_years(start, 1)
    return add_months(start, 1)