"""
Number helpers shared by analytics and budgets.

Before the rewrite, analytics/services.py and budgets/services.py each had
their own copy of "print 25.0 as 25" and their own copy of JavaScript-style
rounding. Keeping them here means there is one definition and one set of tests.

The Node app used JavaScript's Math.round, which rounds halves UP
(0.5 -> 1, 2.5 -> 3). Python's built-in round() rounds halves to the nearest
EVEN number (0.5 -> 0, 2.5 -> 2), so it must not be used for API output.
"""

import math

CENTS = 100


def js_round(value):
    """JavaScript Math.round for the values we deal with: round half up."""
    return math.floor(value + 0.5)


def round_currency(amount):
    """JavaScript Math.round(x * 100) / 100."""
    return js_round(amount * CENTS) / CENTS


def js_number(value):
    """JavaScript prints 25.0 as 25. Whole floats become ints, the rest pass through."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def money(value):
    """Currency amount as it appears in API responses: 2 decimals, whole numbers as ints."""
    return js_number(round_currency(value))