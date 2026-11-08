"""
Tests for common/money.py (shared by analytics and budgets).
Run with:  python manage.py test common
"""

from django.test import SimpleTestCase

from .money import js_number, js_round, money, round_currency


class JsRoundTests(SimpleTestCase):
    def test_halves_round_up(self):
        self.assertEqual(js_round(0.5), 1)
        self.assertEqual(js_round(1.5), 2)
        self.assertEqual(js_round(2.5), 3)

    def test_other_values_round_to_nearest(self):
        self.assertEqual(js_round(2.4), 2)
        self.assertEqual(js_round(2.6), 3)


class RoundCurrencyTests(SimpleTestCase):
    def test_exact_half_cent_rounds_up(self):
        # round(0.125, 2) in Python gives 0.12 (banker's rounding).
        self.assertEqual(round_currency(0.125), 0.13)

    def test_two_decimals_are_kept(self):
        self.assertEqual(round_currency(12.34), 12.34)

    def test_extra_decimals_are_dropped(self):
        self.assertEqual(round_currency(1.2341), 1.23)

    def test_negative_values(self):
        self.assertEqual(round_currency(-50.0), -50.0)


class JsNumberTests(SimpleTestCase):
    def test_whole_float_becomes_int(self):
        result = js_number(25.0)
        self.assertEqual(result, 25)
        self.assertIsInstance(result, int)

    def test_fractional_float_is_unchanged(self):
        self.assertEqual(js_number(25.5), 25.5)

    def test_int_is_unchanged(self):
        self.assertEqual(js_number(7), 7)


class MoneyTests(SimpleTestCase):
    def test_rounds_and_drops_the_trailing_zero(self):
        self.assertEqual(money(10.0), 10)
        self.assertIsInstance(money(10.0), int)

    def test_rounds_half_up_to_cents(self):
        self.assertEqual(money(0.125), 0.13)

    def test_zero(self):
        self.assertEqual(money(0), 0)