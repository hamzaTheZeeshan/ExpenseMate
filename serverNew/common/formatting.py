from datetime import timezone as dt_timezone
from decimal import Decimal

from django.utils import timezone


def iso_datetime(value):
    """
    Format a datetime exactly like JavaScript's Date.toISOString():
        2026-11-07T10:19:50.123Z   (UTC, milliseconds, trailing Z)
    Prisma sent dates to the React app in this format. None stays None.
    """
    if value is None:
        return None
    if timezone.is_naive(value):
        value = timezone.make_aware(value, dt_timezone.utc)
    value = value.astimezone(dt_timezone.utc)
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def decimal_string(value):
    """
    Format a Decimal like Prisma's JSON output: a string with no trailing
    zeros (Decimal("0.00") -> "0", Decimal("100.50") -> "100.5"). None stays None.
    """
    if value is None:
        return None
    number = Decimal(value)
    if number == 0:
        return "0"
    if number == number.to_integral_value():
        return format(number.quantize(Decimal(1)), "f")
    return format(number.normalize(), "f")