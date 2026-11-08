import math
import re
import uuid
from collections.abc import Mapping
from datetime import datetime
from datetime import timezone as dt_timezone
from decimal import ROUND_HALF_UP, Decimal

from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from cards.serializers import CardSerializer
from categories.serializers import CategorySerializer
from common.formatting import decimal_string, iso_datetime

# --------------------------------------------------------------------------
# Joi-style validation (port of transaction.validator.js).
# Same error format as common/validation.py: every message goes into
# {"non_field_errors": [...]}, and common/exceptions.py joins them with ", ".
# Joi rules mirrored: abortEarly false, stripUnknown true, number/date
# conversion of strings.
# --------------------------------------------------------------------------

_MISSING = object()

TXN_TYPES = ("income", "expense")
SORTABLE_FIELDS = ("occurred_at", "amount", "created_at")

CREATE_TYPE_MESSAGE = "type must be 'income' or 'expense'"
SORT_MESSAGE = (
    "sort must be in the form field:direction "
    f"(fields: {', '.join(SORTABLE_FIELDS)}; direction: asc|desc)"
)

SORT_RE = re.compile(r"(occurred_at|amount|created_at):(asc|desc)")
# Joi's guid({ version: "uuidv4" }), without bracket forms.
GUID_V4_RE = re.compile(
    r"[0-9a-f]{8}([:-]?)[0-9a-f]{4}(?:\1)4[0-9a-f]{3}(?:\1)[89ab][0-9a-f]{3}(?:\1)[0-9a-f]{12}",
    re.IGNORECASE,
)
NUMERIC_RE = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?")
# Simplified Joi date().iso(): calendar dates, optional time and offset.
ISO_DATE_RE = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}"
    r"(?:[T ][0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:[.,][0-9]+)?)?"
    r"(?:Z|[+-][0-9]{2}(?::?[0-9]{2})?)?)?"
)

MAX_SAFE_INTEGER = 9007199254740991
CENT = Decimal("0.01")


def _required(key, required):
    return [f'"{key}" is required'] if required else []


def _string(max_length=None, pattern=None, pattern_message=None):
    def check(data, key, required):
        value = data.get(key, _MISSING)
        if value is _MISSING:
            return _MISSING, _required(key, required)
        if not isinstance(value, str):
            return _MISSING, [f'"{key}" must be a string']
        if value == "":
            return _MISSING, [f'"{key}" is not allowed to be empty']
        errors = []
        if max_length is not None and len(value) > max_length:
            errors.append(
                f'"{key}" length must be less than or equal to {max_length} characters long'
            )
        if pattern is not None and not pattern.fullmatch(value):
            errors.append(pattern_message)
        return (value if not errors else _MISSING), errors

    return check


def _enum(allowed, message=None):
    def check(data, key, required):
        value = data.get(key, _MISSING)
        if value is _MISSING:
            return _MISSING, _required(key, required)
        if not isinstance(value, str) or value not in allowed:
            return _MISSING, [message or f'"{key}" must be one of [{", ".join(allowed)}]']
        return value, []

    return check


def _parse_number(value):
    """Approximates Joi.number() conversion. Returns a finite float or None."""
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


def _number(integer=False, positive=False, maximum=None, as_decimal=False):
    def check(data, key, required):
        value = data.get(key, _MISSING)
        if value is _MISSING:
            return _MISSING, _required(key, required)
        number = _parse_number(value)
        if number is None:
            return _MISSING, [f'"{key}" must be a number']
        if abs(number) > MAX_SAFE_INTEGER:
            return _MISSING, [f'"{key}" must be a safe number']
        errors = []
        if integer and number != math.floor(number):
            errors.append(f'"{key}" must be an integer')
        if positive and number <= 0:
            errors.append(f'"{key}" must be a positive number')
        if maximum is not None and number > maximum:
            errors.append(f'"{key}" must be less than or equal to {maximum}')
        if errors:
            return _MISSING, errors
        if as_decimal:
            return Decimal(repr(number)).quantize(CENT, rounding=ROUND_HALF_UP), []
        return (int(number) if integer else number), []

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
        if not GUID_V4_RE.fullmatch(value):
            return _MISSING, [f'"{key}" must be a valid GUID']
        return str(uuid.UUID(hex=value.replace(":", "").replace("-", ""))), []

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
    def check(data, key, required):
        value = data.get(key, _MISSING)
        if value is _MISSING:
            return _MISSING, _required(key, required)
        parsed = _parse_iso_datetime(value) if isinstance(value, str) else None
        if parsed is None:
            return _MISSING, [f'"{key}" must be in ISO 8601 date format']
        return parsed, []

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


CREATE_SPEC = [
    ("type", _enum(TXN_TYPES, CREATE_TYPE_MESSAGE), True),
    ("amount", _number(positive=True, as_decimal=True), True),
    ("merchant", _string(max_length=100), False),
    ("note", _string(max_length=500), False),
    ("card_id", _uuid(), False),
    ("category_id", _uuid(), False),
    ("occurred_at", _iso_date(), False),
]

# The Joi update schema has no custom message on `type`, so it uses Joi's default.
UPDATE_SPEC = [
    ("type", _enum(TXN_TYPES), False),
    ("amount", _number(positive=True, as_decimal=True), False),
    ("merchant", _string(max_length=100), False),
    ("note", _string(max_length=500), False),
    ("card_id", _uuid(), False),
    ("category_id", _uuid(), False),
    ("occurred_at", _iso_date(), False),
]

LIST_SPEC = [
    ("type", _enum(TXN_TYPES), False),
    ("category_id", _uuid(), False),
    ("card_id", _uuid(), False),
    ("start_date", _iso_date(), False),
    ("end_date", _iso_date(), False),
    ("page", _number(integer=True, positive=True), False),
    ("limit", _number(integer=True, positive=True, maximum=100), False),
    (
        "sort",
        _string(pattern=SORT_RE, pattern_message=SORT_MESSAGE),
        False,
    ),
]


def validate_create_body(data):
    _require_object(data)
    cleaned, errors = _run(data, CREATE_SPEC)
    if errors:
        _raise(errors)
    return cleaned


def validate_update_body(data):
    _require_object(data)
    cleaned, errors = _run(data, UPDATE_SPEC)
    if not errors and not cleaned:
        errors = ["At least one field must be provided to update"]
    if errors:
        _raise(errors)
    return cleaned


def validate_list_query(query_params):
    """Returns (filters, pagination) with page/limit/sort defaults applied."""
    raw = {}
    for key, values in query_params.lists():
        # Express turns repeated params into an array, which Joi rejects.
        raw[key] = values[0] if len(values) == 1 else values
    cleaned, errors = _run(raw, LIST_SPEC)
    if errors:
        _raise(errors)

    pagination = {
        "page": cleaned.pop("page", 1),
        "limit": cleaned.pop("limit", 20),
        "sort": cleaned.pop("sort", "occurred_at:desc"),
    }
    return cleaned, pagination


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------


class TransactionSerializer(serializers.Serializer):
    """Output only. Emits the exact camelCase keys Prisma returned."""

    def to_representation(self, instance):
        return {
            "id": str(instance.id),
            "userId": str(instance.user_id),
            "cardId": str(instance.card_id) if instance.card_id else None,
            "categoryId": str(instance.category_id) if instance.category_id else None,
            "type": instance.type,
            "amount": decimal_string(instance.amount),
            "merchant": instance.merchant,
            "note": instance.note,
            "occurredAt": iso_datetime(instance.occurred_at),
            "createdAt": iso_datetime(instance.created_at),
            "card": CardSerializer(instance.card).data if instance.card_id else None,
            "category": (
                CategorySerializer(instance.category).data
                if instance.category_id
                else None
            ),
        }