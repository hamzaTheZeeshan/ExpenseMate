from datetime import timezone as dt_timezone

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