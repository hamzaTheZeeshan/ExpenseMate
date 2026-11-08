import re
from collections.abc import Mapping
from datetime import datetime
from datetime import timezone as dt_timezone

from rest_framework.exceptions import ValidationError

# Joi-style query validation (port of analytics.validator.js). Same error
# format as the other apps: messages go into {"non_field_errors": [...]} and
# common/exceptions.py joins them with ", ". Unknown params are stripped.
# Helpers are duplicated on purpose, as in budgets/ (no other app is touched).

_MISSING = object()

GRANULARITIES = ("day", "week", "month")

ISO_DATE_RE = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}"
    r"(?:[T ][0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:[.,][0-9]+)?)?"
    r"(?:Z|[+-][0-9]{2}(?::?[0-9]{2})?)?)?"
)


def _parse_iso_datetime(value):
    if not ISO_DATE_RE.fullmatch(value):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace(",", "."))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        # A date-only string (or naive datetime) means UTC, like Joi/JS.
        parsed = parsed.replace(tzinfo=dt_timezone.utc)
    return parsed.astimezone(dt_timezone.utc)


def _iso_date(data, key):
    value = data.get(key, _MISSING)
    if value is _MISSING:
        return _MISSING, []
    parsed = _parse_iso_datetime(value) if isinstance(value, str) else None
    if parsed is None:
        return _MISSING, [f'"{key}" must be in ISO 8601 date format']
    return parsed, []


def _granularity(data, key):
    value = data.get(key, _MISSING)
    if value is _MISSING:
        return _MISSING, []
    if not isinstance(value, str) or value not in GRANULARITIES:
        return _MISSING, [f'"{key}" must be one of [{", ".join(GRANULARITIES)}]']
    return value, []


def _run(raw, spec):
    cleaned = {}
    errors = []
    for key, check in spec:
        value, field_errors = check(raw, key)
        if field_errors:
            errors.extend(field_errors)
        elif value is not _MISSING:
            cleaned[key] = value
    if errors:
        raise ValidationError({"non_field_errors": errors})
    return cleaned


def _raw_query(query_params):
    raw = {}
    for key, values in query_params.lists():
        # Express turns repeated params into an array, which Joi rejects.
        raw[key] = values[0] if len(values) == 1 else values
    return raw


DATE_RANGE_SPEC = [("start_date", _iso_date), ("end_date", _iso_date)]
OVER_TIME_SPEC = DATE_RANGE_SPEC + [("granularity", _granularity)]


def validate_date_range_query(query_params):
    """spending-by-category and income-vs-expense. Returns start_date/end_date if sent."""
    return _run(_raw_query(query_params), DATE_RANGE_SPEC)


def validate_over_time_query(query_params):
    """spending-over-time. granularity defaults to "day"."""
    cleaned = _run(_raw_query(query_params), OVER_TIME_SPEC)
    cleaned.setdefault("granularity", "day")
    return cleaned