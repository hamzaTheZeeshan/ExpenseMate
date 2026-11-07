import re
from collections.abc import Mapping

from rest_framework.exceptions import ValidationError

# Replacement for validate.middleware.js + Joi. Produces the same messages as
# Joi (with abortEarly: false, stripUnknown: true), for example:
#   "email" is required
#   "email" must be a valid email
# Serializers call validate_fields(); the errors come out as one 400 message
# joined with ", " by common/exceptions.py.

_MISSING = object()

# Approximation of Joi's string().email(): needs a domain with a dot and a
# TLD of 2+ letters.
_EMAIL_RE = re.compile(r"^[^\s@]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$")


def check_string(
    data,
    key,
    *,
    email=False,
    min_length=None,
    min_message=None,
    pattern=None,
    pattern_message=None,
):
    """Validate one required string field. Returns (value_or_None, [errors])."""
    value = data.get(key, _MISSING)

    if value is _MISSING:
        return None, [f'"{key}" is required']
    if not isinstance(value, str):
        return None, [f'"{key}" must be a string']
    if value == "":
        return None, [f'"{key}" is not allowed to be empty']

    errors = []
    if min_length is not None and len(value) < min_length:
        errors.append(
            min_message or f'"{key}" length must be at least {min_length} characters long'
        )
    if pattern is not None and not pattern.match(value):
        errors.append(
            pattern_message
            or f'"{key}" with value "{value}" fails to match the required pattern: {pattern.pattern}'
        )
    if email and (len(value) > 254 or not _EMAIL_RE.match(value)):
        errors.append(f'"{key}" must be a valid email')

    return (None if errors else value), errors


def validate_fields(data, spec):
    """
    spec is a list of (key, options) pairs, in the same order as the Joi
    schema keys. Unknown keys are dropped (stripUnknown). All errors are
    collected, not just the first (abortEarly: false).
    """
    if not isinstance(data, Mapping):
        raise ValidationError({"non_field_errors": ['"value" must be of type object']})

    cleaned = {}
    errors = []
    for key, options in spec:
        value, field_errors = check_string(data, key, **options)
        if field_errors:
            errors.extend(field_errors)
        else:
            cleaned[key] = value

    if errors:
        raise ValidationError({"non_field_errors": errors})
    return cleaned