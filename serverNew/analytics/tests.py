"""
Unit tests for the rewritten AnalyticsService.

No database is used: the repository, category lookup and clock are replaced by
small fakes, so the tests only check the logic of the service itself.
Run with:  python manage.py test analytics
"""

from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase

from . import services
from .services import AnalyticsService

UTC = dt_timezone.utc
NOW = datetime(2026, 11, 8, 14, 33, tzinfo=UTC)


class FakeRepository:
    """Records the arguments it receives and returns canned rows."""

    def __init__(self, by_category=None, over_time=None, totals=None, averages=None):
        self.by_category = by_category or []
        self.over_time = over_time or []
        self.totals = totals or {"income": 0.0, "expense": 0.0}
        self.averages = averages or []
        self.calls = []

    def spending_by_category(self, user_id, start, end):
        self.calls.append(("spending_by_category", user_id, start, end))
        return self.by_category

    def spending_over_time(self, user_id, start, end, granularity):
        self.calls.append(("spending_over_time", user_id, start, end, granularity))
        return self.over_time

    def income_vs_expense(self, user_id, start, end):
        self.calls.append(("income_vs_expense", user_id, start, end))
        return self.totals

    def average_spend_by_category(self, user_id, months_back):
        self.calls.append(("average_spend_by_category", user_id, months_back))
        return self.averages


FOOD = SimpleNamespace(id="b-food", name="Food", color="#ff0000")
RENT = SimpleNamespace(id="a-rent", name="Rent", color="#0000ff")


def make_service(repo=None, categories=(FOOD, RENT), **kwargs):
    return AnalyticsService(
        repo=repo or FakeRepository(),
        categories_for=lambda user_id: list(categories),
        clock=lambda: NOW,
        format_datetime=lambda value: value.isoformat(),
        **kwargs,
    )


class MonthHelperTests(SimpleTestCase):
    def test_start_of_current_month(self):
        self.assertEqual(
            services.start_of_current_month(NOW), datetime(2026, 11, 1, tzinfo=UTC)
        )

    def test_start_of_next_month(self):
        self.assertEqual(
            services.start_of_next_month(NOW), datetime(2026, 12, 1, tzinfo=UTC)
        )

    def test_start_of_next_month_rolls_over_the_year_in_december(self):
        december = datetime(2026, 12, 20, 9, 0, tzinfo=UTC)
        self.assertEqual(
            services.start_of_next_month(december), datetime(2027, 1, 1, tzinfo=UTC)
        )


class SpendingByCategoryTests(SimpleTestCase):
    def test_defaults_to_the_current_month_and_passes_user_id(self):
        repo = FakeRepository()
        make_service(repo).spending_by_category("u1")
        self.assertEqual(
            repo.calls[0],
            (
                "spending_by_category",
                "u1",
                datetime(2026, 11, 1, tzinfo=UTC),
                datetime(2026, 12, 1, tzinfo=UTC),
            ),
        )

    def test_explicit_range_is_passed_through_untouched(self):
        repo = FakeRepository()
        start, end = datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 2, 1, tzinfo=UTC)
        make_service(repo).spending_by_category("u1", start, end)
        self.assertEqual(repo.calls[0][2:], (start, end))

    def test_only_a_missing_bound_is_defaulted(self):
        repo = FakeRepository()
        start = datetime(2026, 1, 1, tzinfo=UTC)
        make_service(repo).spending_by_category("u1", start_date=start)
        self.assertEqual(repo.calls[0][2], start)
        self.assertEqual(repo.calls[0][3], datetime(2026, 12, 1, tzinfo=UTC))

    def test_known_category_gets_name_and_color_and_rounded_amount(self):
        repo = FakeRepository(by_category=[{"category_id": "b-food", "total": Decimal("12.345")}])
        result = make_service(repo).spending_by_category("u1")
        self.assertEqual(
            result,
            [{"category_id": "b-food", "name": "Food", "color": "#ff0000", "amount": 12.35}],
        )

    def test_missing_category_is_reported_as_uncategorized(self):
        repo = FakeRepository(by_category=[{"category_id": None, "total": Decimal("5")}])
        result = make_service(repo).spending_by_category("u1")
        self.assertEqual(result[0]["name"], "Uncategorized")
        self.assertIsNone(result[0]["color"])

    def test_deleted_category_id_is_also_uncategorized(self):
        repo = FakeRepository(by_category=[{"category_id": "gone", "total": Decimal("5")}])
        result = make_service(repo).spending_by_category("u1")
        self.assertEqual(result[0]["name"], "Uncategorized")
        self.assertEqual(result[0]["category_id"], "gone")

    def test_whole_amounts_are_ints_like_json_from_node(self):
        repo = FakeRepository(by_category=[{"category_id": "b-food", "total": Decimal("25.00")}])
        amount = make_service(repo).spending_by_category("u1")[0]["amount"]
        self.assertEqual(amount, 25)
        self.assertIsInstance(amount, int)

    def test_null_total_counts_as_zero(self):
        repo = FakeRepository(by_category=[{"category_id": "b-food", "total": None}])
        self.assertEqual(make_service(repo).spending_by_category("u1")[0]["amount"], 0)


class SpendingOverTimeTests(SimpleTestCase):
    def test_default_window_is_the_last_30_days_ending_now(self):
        repo = FakeRepository()
        make_service(repo).spending_over_time("u1")
        _, _, start, end, granularity = repo.calls[0]
        self.assertEqual(end, NOW)
        self.assertEqual(start, NOW - timedelta(days=30))
        self.assertEqual(granularity, "day")

    def test_default_window_length_is_configurable(self):
        repo = FakeRepository()
        make_service(repo, over_time_days=7).spending_over_time("u1")
        self.assertEqual(repo.calls[0][2], NOW - timedelta(days=7))

    def test_missing_start_is_measured_back_from_the_given_end(self):
        repo = FakeRepository()
        end = datetime(2026, 6, 30, tzinfo=UTC)
        make_service(repo).spending_over_time("u1", end_date=end)
        self.assertEqual(repo.calls[0][2], end - timedelta(days=30))

    def test_granularity_is_forwarded(self):
        repo = FakeRepository()
        make_service(repo).spending_over_time("u1", granularity="month")
        self.assertEqual(repo.calls[0][4], "month")

    def test_rows_are_formatted_and_rounded(self):
        period = datetime(2026, 11, 1, tzinfo=UTC)
        repo = FakeRepository(over_time=[{"period": period, "amount": 10.005}])
        result = make_service(repo).spending_over_time("u1")
        self.assertEqual(result, [{"period": period.isoformat(), "amount": 10.01}])


class IncomeVsExpenseTests(SimpleTestCase):
    def test_net_is_income_minus_expense(self):
        repo = FakeRepository(totals={"income": 1000.0, "expense": 250.5})
        self.assertEqual(
            make_service(repo).income_vs_expense("u1"),
            {"income": 1000, "expense": 250.5, "net": 749.5},
        )

    def test_net_can_be_negative(self):
        repo = FakeRepository(totals={"income": 100.0, "expense": 150.0})
        self.assertEqual(make_service(repo).income_vs_expense("u1")["net"], -50)

    def test_floating_point_noise_is_rounded_away(self):
        repo = FakeRepository(totals={"income": 0.3, "expense": 0.1})
        self.assertEqual(make_service(repo).income_vs_expense("u1")["net"], 0.2)

    def test_defaults_to_the_current_month(self):
        repo = FakeRepository()
        make_service(repo).income_vs_expense("u1")
        self.assertEqual(repo.calls[0][2:], (datetime(2026, 11, 1, tzinfo=UTC), datetime(2026, 12, 1, tzinfo=UTC)))


class SpendingRadarTests(SimpleTestCase):
    def test_merges_this_month_with_the_average(self):
        repo = FakeRepository(
            by_category=[{"category_id": "b-food", "total": Decimal("40")}],
            averages=[{"category_id": "b-food", "average": 25.0}],
        )
        result = make_service(repo).spending_radar("u1")
        self.assertEqual(
            result,
            [{"category_id": "b-food", "name": "Food", "this_period": 40, "average": 25}],
        )

    def test_category_in_only_one_source_gets_zero_for_the_other(self):
        repo = FakeRepository(
            by_category=[{"category_id": "b-food", "total": Decimal("40")}],
            averages=[{"category_id": "a-rent", "average": 500.0}],
        )
        by_id = {row["category_id"]: row for row in make_service(repo).spending_radar("u1")}
        self.assertEqual(by_id["b-food"]["average"], 0)
        self.assertEqual(by_id["a-rent"]["this_period"], 0)

    def test_order_is_by_id_with_uncategorized_last(self):
        repo = FakeRepository(
            by_category=[
                {"category_id": None, "total": Decimal("1")},
                {"category_id": "b-food", "total": Decimal("1")},
            ],
            averages=[{"category_id": "a-rent", "average": 1.0}],
        )
        ids = [row["category_id"] for row in make_service(repo).spending_radar("u1")]
        self.assertEqual(ids, ["a-rent", "b-food", None])

    def test_uses_the_configured_number_of_months_back(self):
        repo = FakeRepository()
        make_service(repo, radar_months_back=3).spending_radar("u1")
        self.assertIn(("average_spend_by_category", "u1", 3), repo.calls)

    def test_default_is_six_months_back(self):
        repo = FakeRepository()
        make_service(repo).spending_radar("u1")
        self.assertIn(("average_spend_by_category", "u1", 6), repo.calls)

    def test_no_data_gives_an_empty_list(self):
        self.assertEqual(make_service().spending_radar("u1"), [])