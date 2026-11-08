from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone

from cards.models import Card
from cards.services import find_card_by_id
from categories.services import find_category_by_id
from common.errors import AppError

from .models import Transaction

SORT_FIELDS = ("occurred_at", "amount", "created_at")


# --- Query building (shared by the list and the aggregate helpers) ---


def _filter_kwargs(user_id, filters):
    kwargs = {"user_id": user_id}
    if filters.get("type"):
        kwargs["type"] = filters["type"]
    if filters.get("category_id"):
        kwargs["category_id"] = filters["category_id"]
    if filters.get("card_id"):
        kwargs["card_id"] = filters["card_id"]
    # Both bounds are inclusive here (unlike analytics and budgets).
    if filters.get("start_date"):
        kwargs["occurred_at__gte"] = filters["start_date"]
    if filters.get("end_date"):
        kwargs["occurred_at__lte"] = filters["end_date"]
    return kwargs


def _order_by(sort):
    parts = (sort or "").split(":")
    field = parts[0]
    direction = parts[1] if len(parts) > 1 else None
    if field not in SORT_FIELDS or direction not in ("asc", "desc"):
        return ["-occurred_at", "id"]
    # "id" is a tie-breaker so offset pagination is stable.
    return [field if direction == "asc" else f"-{field}", "id"]


# --- Public helpers for budgets / analytics / dashboard ---


def find_all_for_user(user_id, filters=None, pagination=None):
    """
    Returns (rows, total). filters: type, category_id, card_id, start_date,
    end_date (inclusive both ends). pagination: page, limit, sort ("field:dir").
    Rows come with .card and .category loaded.
    """
    filters = filters or {}
    pagination = pagination or {}
    page = pagination.get("page", 1)
    limit = pagination.get("limit", 20)

    queryset = Transaction.objects.filter(**_filter_kwargs(user_id, filters))
    total = queryset.count()
    offset = (page - 1) * limit
    rows = list(
        queryset.select_related("card", "category").order_by(
            *_order_by(pagination.get("sort"))
        )[offset : offset + limit]
    )
    return rows, total


def sum_by_type_for_user(user_id, filters=None):
    """Totals per type: [{"type": "income", "total": Decimal}, ...]."""
    rows = (
        Transaction.objects.filter(**_filter_kwargs(user_id, filters or {}))
        .values("type")
        .annotate(total=Sum("amount"))
        .order_by("type")
    )
    return [{"type": row["type"], "total": row["total"]} for row in rows]


def sum_expenses_for_category_in_range(user_id, category_id, start_date, end_date):
    """Expense total with occurred_at >= start and < end (exclusive end). Plain float."""
    total = Transaction.objects.filter(
        user_id=user_id,
        category_id=category_id,
        type="expense",
        occurred_at__gte=start_date,
        occurred_at__lt=end_date,
    ).aggregate(total=Sum("amount"))["total"]
    return float(total or 0)


def find_transaction_by_id(transaction_id):
    """Returns the Transaction (with card and category) or None. No ownership check."""
    try:
        return (
            Transaction.objects.select_related("card", "category")
            .filter(pk=transaction_id)
            .first()
        )
    except (DjangoValidationError, ValueError):
        # Malformed UUID: treat as "not found".
        return None


# --- Ownership checks ---


def _assert_card_ownership(card_id, user_id):
    if not card_id:
        return
    card = find_card_by_id(card_id)
    if card is None:
        raise AppError("Card not found", 404)
    if str(card.user_id) != str(user_id):
        raise AppError("Card does not belong to this user", 403)


def _assert_category_ownership(category_id, user_id):
    if not category_id:
        return
    category = find_category_by_id(category_id)
    if category is None:
        raise AppError("Category not found", 404)
    # Global default categories (user is null) are allowed for everyone.
    if category.user_id is not None and str(category.user_id) != str(user_id):
        raise AppError("Category does not belong to this user", 403)


def _get_accessible(user_id, transaction_id):
    row = find_transaction_by_id(transaction_id)
    if row is None:
        raise AppError("Transaction not found", 404)
    if str(row.user_id) != str(user_id):
        raise AppError("You do not have access to this transaction", 403)
    return row


# --- Card effect ---


def _apply_card_effect(card_id, txn_type, amount, reverse=False):
    """
    Port of applyCardEffect in transaction.repository.js, copied exactly.

    TODO(KNOWN QUIRK, DO NOT "FIX" WITHOUT A DATA MIGRATION): an expense
    SHRINKS credit_limit and GROWS credit_used, and an income GROWS
    credit_limit. That looks backwards, but existing rows already reflect this
    math, so it is reproduced as-is. Changing it here would make new data
    disagree with old data.

        expense: credit_limit -= amount, credit_used += amount
        income:  credit_limit += amount
    reverse=True applies the opposite operations.

    F() keeps each update atomic in the database. cards.updated_at is
    deliberately not touched (Node's schema has no @updatedAt).
    """
    if not card_id:
        return

    if txn_type == "expense":
        if reverse:
            changes = {
                "credit_limit": F("credit_limit") + amount,
                "credit_used": F("credit_used") - amount,
            }
        else:
            changes = {
                "credit_limit": F("credit_limit") - amount,
                "credit_used": F("credit_used") + amount,
            }
    elif txn_type == "income":
        changes = {
            "credit_limit": F("credit_limit") - amount
            if reverse
            else F("credit_limit") + amount
        }
    else:
        return

    Card.objects.filter(pk=card_id).update(**changes)


# --- Use cases ---


def get_transactions(user_id, filters, pagination):
    # Filters only narrow a query that is always scoped to user_id, so no
    # ownership check on filters.category_id / filters.card_id.
    return find_all_for_user(user_id, filters, pagination)


def get_transaction_by_id(user_id, transaction_id):
    return _get_accessible(user_id, transaction_id)


def create_transaction(user_id, data):
    _assert_card_ownership(data.get("card_id"), user_id)
    _assert_category_ownership(data.get("category_id"), user_id)

    with transaction.atomic():
        created = Transaction.objects.create(
            user_id=user_id,
            type=data["type"],
            amount=data["amount"],
            merchant=data.get("merchant"),
            note=data.get("note"),
            card_id=data.get("card_id"),
            category_id=data.get("category_id"),
            occurred_at=data.get("occurred_at") or timezone.now(),
        )
        _apply_card_effect(created.card_id, created.type, created.amount)
        # Re-read so the nested card shows the updated limit/used values.
        return find_transaction_by_id(created.pk)


def update_transaction(user_id, transaction_id, data):
    _get_accessible(user_id, transaction_id)

    if "card_id" in data:
        _assert_card_ownership(data["card_id"], user_id)
    if "category_id" in data:
        _assert_category_ownership(data["category_id"], user_id)

    with transaction.atomic():
        # Lock the row so concurrent updates/deletes cannot apply the card
        # effect twice.
        existing = Transaction.objects.select_for_update().filter(pk=transaction_id).first()
        if existing is None:
            raise AppError("Transaction not found", 404)

        # Undo the old effect on the old card.
        _apply_card_effect(existing.card_id, existing.type, existing.amount, reverse=True)

        for field, value in data.items():
            setattr(existing, field, value)
        existing.save(update_fields=list(data.keys()))

        # Apply the new values to the (possibly different) card.
        _apply_card_effect(existing.card_id, existing.type, existing.amount)

        return find_transaction_by_id(existing.pk)


def delete_transaction(user_id, transaction_id):
    _get_accessible(user_id, transaction_id)

    with transaction.atomic():
        existing = Transaction.objects.select_for_update().filter(pk=transaction_id).first()
        if existing is None:
            # Without this, a concurrent delete would reverse the effect twice.
            raise AppError("Transaction not found", 404)

        card_id, txn_type, amount = existing.card_id, existing.type, existing.amount
        existing.delete()
        _apply_card_effect(card_id, txn_type, amount, reverse=True)