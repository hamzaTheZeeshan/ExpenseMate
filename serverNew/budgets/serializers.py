import math
import re
import uuid
from collections.abc import Mapping
from datetime import date, datetime
from datetime import timezone as dt_timezone
from decimal import ROUND_HALF_UP, Decimal

from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from categories.serializers import CategorySerializer
from common.formatting import decimal_string, iso_datetime

# --------------------------------------------------------------------------
# Joi-style validation (port of budget.validator.js). Same error format as
# the other apps: every message goes into {"non_field_errors": [...]} and
# common/exceptions.py joins them with ", ". abortEarly false, stripUnknown true.
# These small helpers are intentionally duplicated from transactions/
# (the "Option A" decision), so no other app is touched.
# --------------------------------------------------------------------------

_MISSING = object()

PERIODS = ("weekly", "monthly", "yearly")
END_AFTER_START_MESSAGE = "end_date must be after start_date"
UPDATE_MIN_MESSAGE = "At least one field must be provided to update"

# Joi's uuid() with no version: any 8-4-4-4-12 hex GUID, same separator throughout.
GUID_RE = re.compile(
    r"[0-9a-f]{8}([:-]?)[0-9a-f]{4}(?:\1)[0-9a-f]{4}(?:\1)[0-9a-f]{4}(?:\1)[0-9a-f]{12}",
    re.IGNORECASE,
)
NUMERIC_RE = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?")
ISO_DATE_RE = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}"
    r"(?:[T ][0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:[.,][0-9]+)?)?"
    r"(?:Z|[+-][0-9]{2}(?::?[0-9]{2})?)?)?"
)
MAX_SAFE_INTEGER = 9007199254740991
CENT = Decimal("0.01")


def _required(key, required):
    return [f'"{key}" is required'] if required else []


def _enum(allowed):
    def check(data, key, required):
        value = data.get(key, _MISSING)
        if value is _MISSING:
            return _MISSING, _required(key, required)
        if not isinstance(value, str) or value not in allowed:
            return _MISSING, [f'"{key}" must be one of [{", ".join(allowed)}]']
        return value, []

    return check


def _uuid():
    def check(data, key, required):
        value = data.get(key, _MISSING)
        if value is _MISSING:
            return _MISSING, _required(key, required)
        if not isinstance(value, str):
            return _MISSING, [f'"{key}" must be a string']
        if value == "":
            return _MISSING, [f'"{key}" is not allowed to be empty']
        if not GUID_RE.fullmatch(value):
            return _MISSING, [f'"{key}" must be a valid GUID']
        return str(uuid.UUID(hex=value.replace(":", "").replace("-", ""))), []

    return check


def _parse_number(value):
    if isinstance(value, bool):
        return None
    try:
        if isinstance(value, (int, float)):
            number = float(value)
        elif isinstance(value, str):
            text = value.strip()
            if not NUMERIC_RE.fullmatch(text):
                return None
            number = float(text)
        else:
            return None
    except OverflowError:
        return None
    return number if math.isfinite(number) else None


def _positive_amount():
    def check(data, key, required):
        value = data.get(key, _MISSING)
        if value is _MISSING:
            return _MISSING, _required(key, required)
        number = _parse_number(value)
        if number is None:
            return _MISSING, [f'"{key}" must be a number']
        if abs(number) > MAX_SAFE_INTEGER:
            return _MISSING, [f'"{key}" must be a safe number']
        if number <= 0:
            return _MISSING, [f'"{key}" must be a positive number']
        return Decimal(repr(number)).quantize(CENT, rounding=ROUND_HALF_UP), []

    return check


def _parse_iso_datetime(value):
    if not ISO_DATE_RE.fullmatch(value):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace(",", "."))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt_timezone.utc)
    return parsed.astimezone(dt_timezone.utc)


def _iso_date():
    """Returns an aware UTC datetime (like Joi's Date); converted to a date later."""

    def check(data, key, required):
        value = data.get(key, _MISSING)
        if value is _MISSING:
            return _MISSING, _required(key, required)
        parsed = _parse_iso_datetime(value) if isinstance(value, str) else None
        if parsed is None:
            return _MISSING, [f'"{key}" must be in ISO 8601 date format']
        return parsed, []

    return check


def _boolean():
    def check(data, key, required):
        value = data.get(key, _MISSING)
        if value is _MISSING:
            return _MISSING, _required(key, required)
        if isinstance(value, bool):
            return value, []
        if isinstance(value, str) and value.lower() in ("true", "false"):
            return value.lower() == "true", []
        return _MISSING, [f'"{key}" must be a boolean']

    return check


def _run(data, spec):
    cleaned = {}
    errors = []
    for key, check, required in spec:
        value, field_errors = check(data, key, required)
        if field_errors:
            errors.extend(field_errors)
        elif value is not _MISSING:
            cleaned[key] = value
    return cleaned, errors


def _require_object(data):
    if not isinstance(data, Mapping):
        raise ValidationError({"non_field_errors": ['"value" must be of type object']})


def _raise(errors):
    raise ValidationError({"non_field_errors": errors})


def _end_after_start_errors(cleaned):
    # Joi's object-level custom rule: only runs when every field was valid,
    # and only when both dates are in the payload.
    start = cleaned.get("start_date")
    end = cleaned.get("end_date")
    if start is not None and end is not None and end <= start:
        return [END_AFTER_START_MESSAGE]
    return []


def _to_db_dates(cleaned):
    # Prisma writes a JS Date into a @db.Date column as its UTC calendar date.
    for key in ("start_date", "end_date"):
        if key in cleaned:
            cleaned[key] = cleaned[key].date()
    return cleaned


CREATE_SPEC = [
    ("category_id", _uuid(), True),
    ("amount", _positive_amount(), True),
    ("period", _enum(PERIODS), False),
    ("start_date", _iso_date(), True),
    ("end_date", _iso_date(), False),
]

UPDATE_SPEC = [
    ("category_id", _uuid(), False),
    ("amount", _positive_amount(), False),
    ("period", _enum(PERIODS), False),
    ("start_date", _iso_date(), False),
    ("end_date", _iso_date(), False),
]

LIST_SPEC = [
    ("category_id", _uuid(), False),
    ("period", _enum(PERIODS), False),
    ("active", _boolean(), False),
]


def validate_create_body(data):
    _require_object(data)
    cleaned, errors = _run(data, CREATE_SPEC)
    if not errors:
        cleaned.setdefault("period", "monthly")
        errors = _end_after_start_errors(cleaned)
    if errors:
        _raise(errors)
    return _to_db_dates(cleaned)


def validate_update_body(data):
    _require_object(data)
    cleaned, errors = _run(data, UPDATE_SPEC)
    if not errors:
        errors = [UPDATE_MIN_MESSAGE] if not cleaned else _end_after_start_errors(cleaned)
    if errors:
        _raise(errors)
    return _to_db_dates(cleaned)


def validate_list_query(query_params):
    raw = {}
    for key, values in query_params.lists():
        # Express turns repeated params into an array, which Joi rejects.
        raw[key] = values[0] if len(values) == 1 else values
    cleaned, errors = _run(raw, LIST_SPEC)
    if errors:
        _raise(errors)
    return cleaned


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------


def _date_as_iso_datetime(value):
    """Prisma sends @db.Date columns as midnight-UTC ISO datetimes."""
    if value is None:
        return None
    if isinstance(value, datetime):
        value = value.astimezone(dt_timezone.utc).date()
    return iso_datetime(datetime(value.year, value.month, value.day, tzinfo=dt_timezone.utc))


class BudgetSerializer(serializers.Serializer):
    """Output only. The raw record plus nested category, Prisma camelCase keys."""

    def to_representation(self, instance):
        return {
            "id": str(instance.id),
            "userId": str(instance.user_id),
            "categoryId": str(instance.category_id) if instance.category_id else None,
            "amount": decimal_string(instance.amount),
            "period": instance.period,
            "startDate": _date_as_iso_datetime(instance.start_date),
            "endDate": _date_as_iso_datetime(instance.end_date),
            "createdAt": iso_datetime(instance.created_at),
            "category": (
                CategorySerializer(instance.category).data
                if instance.category_id
                else None
            ),
        }


class BudgetWithProgressSerializer(BudgetSerializer):
    """Adds the snake_case progress keys Node spread onto the record."""

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["spent"] = instance.spent
        data["remaining"] = instance.remaining
        data["percent_used"] = instance.percent_used
        return data