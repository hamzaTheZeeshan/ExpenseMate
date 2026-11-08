import math

from analytics.services import get_income_vs_expense
from budgets.services import get_budgets
from cards.services import get_cards
from transactions.services import find_all_for_user

RECENT_TRANSACTIONS_LIMIT = 5


def _round_currency(amount):
    """JavaScript Math.round(x * 100) / 100: round half up, not banker's rounding."""
    return math.floor(amount * 100 + 0.5) / 100


def _json_number(value):
    """JavaScript prints 25.0 as 25."""
    return int(value) if isinstance(value, float) and value.is_integer() else value


def get_dashboard_summary(user_id):
    """
    Port of getDashboardSummary. Returns model instances / plain values;
    the view serializes them with the same serializers the other modules use.
    Lookups run sequentially (Node used Promise.all).
    """
    recent_rows, _total = find_all_for_user(
        user_id,
        {},
        {"page": 1, "limit": RECENT_TRANSACTIONS_LIMIT, "sort": "occurred_at:desc"},
    )
    cards = get_cards(user_id)
    active_budgets = get_budgets(user_id, {"active": True})
    month_summary = get_income_vs_expense(user_id)

    # Number(card.balance ?? 0): Decimal -> float, summed in list order.
    total_balance = 0.0
    for card in cards:
        total_balance += float(card.balance or 0)

    return {
        "recent_transactions": recent_rows,
        "cards": cards,
        "active_budgets": active_budgets,
        "total_balance": _json_number(_round_currency(total_balance)),
        "month_summary": month_summary,
    }