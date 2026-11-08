import math
import re
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction

from common.errors import AppError

from .models import Card

CARD_FIELDS = (
    "nickname",
    "card_type",
    "last_four",
    "expiry_month",
    "expiry_year",
    "balance",
    "credit_limit",
    "credit_used",
    "currency",
    "color_theme",
    "is_default",
)
DECIMAL_FIELDS = ("balance", "credit_limit", "credit_used")
FORBIDDEN_KEYS = ("card_number", "pan", "cvv", "cvc", "number")

LAST_FOUR_RE = re.compile(r"[0-9]{4}")
HEX_COLOR_RE = re.compile(r"#[0-9A-Fa-f]{6}")
NUMERIC_RE = re.compile(r"[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?")
CENT = Decimal("0.01")


# --- JavaScript-style coercion, so validation behaves like card.service.js ---


def _js_number(value):
    """Approximates JavaScript's Number(value)."""
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        try:
            return float(value)
        except OverflowError:
            return math.inf if value > 0 else -math.inf
    if isinstance(value, str):
        text = value.strip()
        if text == "":
            return 0.0
        if NUMERIC_RE.fullmatch(text):
            return float(text)
        if text in ("Infinity", "+Infinity"):
            return math.inf
        if text == "-Infinity":
            return -math.inf
    return math.nan


def _js_str(value):
    """Approximates JavaScript's String(value) for the cases that matter here."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _is_integer(number):
    return math.isfinite(number) and number == math.floor(number)


def _to_decimal(value):
    """Converts validated input to a Decimal rounded like Postgres numeric(12,2)."""
    if value is None:
        return None
    if isinstance(value, bool):
        number = Decimal(int(value))
    elif isinstance(value, int):
        number = Decimal(value)
    elif isinstance(value, float):
        number = Decimal(repr(value))
    else:
        text = str(value).strip()
        number = Decimal(text) if text else Decimal(0)
    return number.quantize(CENT, rounding=ROUND_HALF_UP)


# --- Validation (port of validateCardInput) ---


def _validate_card_input(data, is_create):
    errors = []

    if is_create and not data.get("nickname"):
        errors.append("nickname is required")
    if "nickname" in data:
        nickname = data["nickname"]
        if not isinstance(nickname, str) or len(nickname) > 50:
            errors.append("nickname must be a string up to 50 characters")

    if is_create and "last_four" not in data:
        errors.append("last_four is required")
    if "last_four" in data and not LAST_FOUR_RE.fullmatch(_js_str(data["last_four"])):
        errors.append("last_four must be exactly 4 digits")

    if "card_type" in data and not isinstance(data["card_type"], str):
        errors.append("card_type must be a string")

    if "expiry_month" in data:
        month = _js_number(data["expiry_month"])
        if not _is_integer(month) or month < 1 or month > 12:
            errors.append("expiry_month must be an integer between 1 and 12")

    if "expiry_year" in data:
        year = _js_number(data["expiry_year"])
        current_year = date.today().year
        if not _is_integer(year) or year < current_year:
            errors.append(f"expiry_year must be {current_year} or later")

    # Node's check here never fires (typeof Number(x) is always "number").
    # Ported intent: balance must be numeric.
    if "balance" in data and not math.isfinite(_js_number(data["balance"])):
        errors.append("balance must be a number")

    if "credit_limit" in data:
        limit = _js_number(data["credit_limit"])
        if not math.isfinite(limit) or limit < 0:
            errors.append("credit_limit must be a number >= 0")

    if "credit_used" in data:
        used = _js_number(data["credit_used"])
        if not math.isfinite(used) or used < 0:
            errors.append("credit_used must be a number >= 0")

    if "credit_limit" in data and "credit_used" in data:
        if _js_number(data["credit_used"]) > _js_number(data["credit_limit"]):
            errors.append("credit_used cannot exceed credit_limit")

    if "currency" in data and not isinstance(data["currency"], str):
        errors.append("currency must be a string")

    if "color_theme" in data:
        color = data["color_theme"]
        if not isinstance(color, str) or not HEX_COLOR_RE.fullmatch(color):
            errors.append("color_theme must be a hex value like #A1B2C3")

    if "is_default" in data and not isinstance(data["is_default"], bool):
        errors.append("is_default must be a boolean")

    if not is_create and len(data) == 0:
        errors.append("At least one field must be provided to update")

    # Hard safety rule: never accept a full card number or CVV, however named.
    for key in FORBIDDEN_KEYS:
        if key in data:
            errors.append(f"{key} is not accepted — only last_four is allowed")

    if errors:
        raise AppError(", ".join(errors), 400)


def _clean(data):
    """Keeps only known columns (unknown keys are ignored) with DB-ready types."""
    fields = {}
    for key in CARD_FIELDS:
        if key not in data:
            continue
        value = data[key]
        if key in DECIMAL_FIELDS:
            value = _to_decimal(value)
        elif key in ("expiry_month", "expiry_year"):
            value = int(_js_number(value))
        elif key == "last_four":
            value = _js_str(value)
        fields[key] = value
    return fields


# --- Lookups (also the public API for the transactions/dashboard apps) ---


def find_card_by_id(card_id):
    """Returns the Card or None. No ownership check."""
    try:
        return Card.objects.filter(pk=card_id).first()
    except (DjangoValidationError, ValueError):
        # Malformed UUID: treat as "not found".
        return None


def get_cards(user_id):
    """The user's cards, default first, then newest first."""
    return list(Card.objects.filter(user_id=user_id).order_by("-is_default", "-created_at"))


def _assert_owned(user_id, card_id):
    card = find_card_by_id(card_id)

    if card is None:
        raise AppError("Card not found", 404)

    if str(card.user_id) != str(user_id):
        raise AppError("You don't have permission to access this card", 403)

    return card


def get_card_by_id(user_id, card_id):
    """Returns the Card if it exists and belongs to the user, else raises AppError 404/403."""
    return _assert_owned(user_id, card_id)


# --- Writes ---


def create_card(user_id, raw_data):
    _validate_card_input(raw_data, is_create=True)

    data = dict(raw_data)
    for key in DECIMAL_FIELDS:
        data.setdefault(key, 0)
    data.setdefault("currency", "USD")
    fields = _clean(data)

    is_first_card = not Card.objects.filter(user_id=user_id).exists()
    # The user's first card is always the default, whatever the payload says.
    should_be_default = is_first_card or data.get("is_default") is True
    fields["is_default"] = should_be_default

    if should_be_default and not is_first_card:
        with transaction.atomic():
            Card.objects.filter(user_id=user_id, is_default=True).update(is_default=False)
            return Card.objects.create(user_id=user_id, **fields)

    return Card.objects.create(user_id=user_id, **fields)


def update_card(user_id, card_id, data):
    card = _assert_owned(user_id, card_id)
    _validate_card_input(data, is_create=False)
    fields = _clean(data)

    with transaction.atomic():
        if data.get("is_default") is True:
            Card.objects.filter(user_id=user_id, is_default=True).exclude(
                pk=card.pk
            ).update(is_default=False)

        if fields:
            for field, value in fields.items():
                setattr(card, field, value)
            # updated_at is deliberately not touched, as in Node.
            card.save(update_fields=list(fields.keys()))

    return card


def delete_card(user_id, card_id):
    card = _assert_owned(user_id, card_id)
    was_default = card.is_default

    with transaction.atomic():
        # transactions.card_id is ON DELETE SET NULL in the database.
        card.delete()

        if was_default:
            most_recent = (
                Card.objects.filter(user_id=user_id)
                .order_by("-is_default", "-created_at")
                .first()
            )
            if most_recent is not None:
                most_recent.is_default = True
                most_recent.save(update_fields=["is_default"])