"""
Unit tests for the rewritten BudgetProgressCalculator.

No database: the "money spent" query is replaced by a fake function, and budgets
are plain objects. Run with:  python manage.py test budgets
"""

from datetime import date, datetime
from datetime import timezone as dt_timezone
from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase

from .progress import BudgetProgress, BudgetProgressCalculator, midnight_utc

UTC = dt_timezone.utc


def make_budget(amount="100.00", start=date(2026, 11, 1), end=None, period="monthly"):
    return SimpleNamespace(
        user_id="u1",
        category_id="c1",
        amount=Decimal(amount),
        start_date=start,
        end_date=end,
        period=period,
    )


def calculator_with_spent(spent):
    """Calculator whose 'database' always reports `spent`. Records its calls."""
    calls = []

    def provider(user_id, category_id, start, end):
        calls.append((user_id, category_id, start, end))
        return spent

    calc = BudgetProgressCalculator(provider)
    calc.calls = calls
    return calc


class WindowTests(SimpleTestCase):
    def test_explicit_end_date_is_used_as_the_exclusive_end(self):
        calc = calculator_with_spent(0.0)
        start, end = calc.window_for(make_budget(end=date(2026, 11, 20)))
        self.assertEqual(start, datetime(2026, 11, 1, tzinfo=UTC))
        self.assertEqual(end, datetime(2026, 11, 20, tzinfo=UTC))

    def test_monthly_budget_without_end_date_ends_one_month_later(self):
        start, end = calculator_with_spent(0.0).window_for(make_budget())
        self.assertEqual(end, datetime(2026, 12, 1, tzinfo=UTC))

    def test_weekly_budget_without_end_date_ends_seven_days_later(self):
        _, end = calculator_with_spent(0.0).window_for(make_budget(period="weekly"))
        self.assertEqual(end, datetime(2026, 11, 8, tzinfo=UTC))

    def test_yearly_budget_without_end_date_ends_one_year_later(self):
        _, end = calculator_with_spent(0.0).window_for(make_budget(period="yearly"))
        self.assertEqual(end, datetime(2027, 11, 1, tzinfo=UTC))

    def test_explicit_end_date_wins_over_the_period(self):
        _, end = calculator_with_spent(0.0).window_for(
            make_budget(period="yearly", end=date(2026, 11, 15))
        )
        self.assertEqual(end, datetime(2026, 11, 15, tzinfo=UTC))

    def test_period_end_function_can_be_replaced(self):
        calc = BudgetProgressCalculator(lambda *a: 0.0, period_end=lambda s, p: "custom")
        self.assertEqual(calc.window_for(make_budget())[1], "custom")

    def test_midnight_utc_accepts_dates_and_datetimes(self):
        expected = datetime(2026, 11, 8, tzinfo=UTC)
        self.assertEqual(midnight_utc(date(2026, 11, 8)), expected)
        self.assertEqual(midnight_utc(datetime(2026, 11, 8, 15, 30)), expected)


class PercentUsedTests(SimpleTestCase):
    def test_zero_spent_is_zero_percent(self):
        self.assertEqual(BudgetProgressCalculator.percent_used(0, 100), 0)

    def test_halves_round_up_like_javascript(self):
        # Python's round(0.5) is 0 and round(2.5) is 2. JavaScript gives 1 and 3.
        self.assertEqual(BudgetProgressCalculator.percent_used(0.5, 100), 1)
        self.assertEqual(BudgetProgressCalculator.percent_used(2.5, 100), 3)

    def test_just_below_half_rounds_down(self):
        self.assertEqual(BudgetProgressCalculator.percent_used(0.4, 100), 0)

    def test_overspending_goes_above_100(self):
        self.assertEqual(BudgetProgressCalculator.percent_used(150, 100), 150)

    def test_zero_amount_budget_is_zero_percent_not_a_crash(self):
        self.assertEqual(BudgetProgressCalculator.percent_used(50, 0), 0)


class CalculateTests(SimpleTestCase):
    def test_returns_spent_remaining_and_percent(self):
        progress = calculator_with_spent(25.0).calculate(make_budget("100.00"))
        self.assertEqual(progress, BudgetProgress(spent=25.0, remaining=75.0, percent_used=25))

    def test_overspent_budget_has_negative_remaining(self):
        progress = calculator_with_spent(130.0).calculate(make_budget("100.00"))
        self.assertEqual(progress.remaining, -30.0)
        self.assertEqual(progress.percent_used, 130)

    def test_nothing_spent_leaves_the_whole_amount(self):
        progress = calculator_with_spent(0.0).calculate(make_budget("80.50"))
        self.assertEqual(progress, BudgetProgress(spent=0.0, remaining=80.5, percent_used=0))

    def test_provider_receives_user_category_and_window(self):
        calc = calculator_with_spent(0.0)
        calc.calculate(make_budget(end=date(2026, 11, 20)))
        self.assertEqual(
            calc.calls,
            [("u1", "c1", datetime(2026, 11, 1, tzinfo=UTC), datetime(2026, 11, 20, tzinfo=UTC))],
        )

    def test_calculate_does_not_modify_the_budget(self):
        budget = make_budget()
        calculator_with_spent(10.0).calculate(budget)
        self.assertFalse(hasattr(budget, "spent"))


class AttachTests(SimpleTestCase):
    def test_sets_the_three_attributes_the_serializer_reads(self):
        budget = calculator_with_spent(33.5).attach(make_budget("100.00"))
        self.assertEqual(budget.spent, 33.5)
        self.assertEqual(budget.remaining, 66.5)
        self.assertEqual(budget.percent_used, 34)

    def test_whole_numbers_are_ints_like_json_from_node(self):
        budget = calculator_with_spent(25.0).attach(make_budget("100.00"))
        self.assertEqual(budget.spent, 25)
        self.assertIsInstance(budget.spent, int)
        self.assertIsInstance(budget.remaining, int)
        self.assertIsInstance(budget.percent_used, int)

    def test_returns_the_same_instance(self):
        budget = make_budget()
        self.assertIs(calculator_with_spent(1.0).attach(budget), budget)