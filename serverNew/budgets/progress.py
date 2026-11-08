"""
Budget progress calculation (spent / remaining / percent used).

REWRITTEN. This used to be a private function inside budgets/services.py
(_attach_progress) that did five jobs at once: work out the date window, run the
database query, do the arithmetic, format numbers JavaScript-style, and mutate
the model instance. It could only be tested with a real database.

BudgetProgressCalculator separates those jobs. The database query is passed in
as `spent_provider`, so the arithmetic and the window rules can be tested with
a plain function and plain objects.
"""

from dataclasses import dataclass
from datetime import datetime
from datetime import timezone as dt_timezone

from common.dates import compute_period_end
from common.money import js_number, js_round


@dataclass(frozen=True)
class BudgetProgress:
    spent: float
    remaining: float
    percent_used: int


def midnight_utc(value):
    """A calendar date (or datetime) as midnight UTC of that day."""
    return datetime(value.year, value.month, value.day, tzinfo=dt_timezone.utc)


class BudgetProgressCalculator:
    """
    Rules (copied from the Node app, intentionally unchanged):
      * Only expenses count.
      * The window is [start_date, end) in UTC. The end is EXCLUSIVE, so the
        end_date day itself is not counted.
      * With no end_date the end is implied by the period (weekly / monthly /
        yearly) and is never saved.
    """

    def __init__(self, spent_provider, period_end=compute_period_end):
        # spent_provider(user_id, category_id, start, end) -> float
        self._spent_provider = spent_provider
        self._period_end = period_end

    def window_for(self, budget):
        start = midnight_utc(budget.start_date)
        if budget.end_date is not None:
            return start, midnight_utc(budget.end_date)
        return start, self._period_end(start, budget.period)

    @staticmethod
    def percent_used(spent, amount):
        """Whole percent, rounded half up like JavaScript. A zero budget is 0%."""
        return int(js_round(spent / amount * 100)) if amount > 0 else 0

    def calculate(self, budget):
        """Pure result object. Does not touch the budget instance."""
        start, end = self.window_for(budget)
        spent = self._spent_provider(
            budget.user_id, budget.category_id, start, end
        )
        amount = float(budget.amount)
        return BudgetProgress(
            spent=spent,
            remaining=amount - spent,
            percent_used=self.percent_used(spent, amount),
        )

    def attach(self, budget):
        """
        Set .spent, .remaining and .percent_used on the instance, which is what
        BudgetWithProgressSerializer reads. Whole floats become ints (25.0 -> 25).
        """
        progress = self.calculate(budget)
        budget.spent = js_number(progress.spent)
        budget.remaining = js_number(progress.remaining)
        budget.percent_used = progress.percent_used
        return budget