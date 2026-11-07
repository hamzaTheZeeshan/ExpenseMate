import logging
import math

from rest_framework.exceptions import MethodNotAllowed, Throttled, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.views import set_rollback

from common.errors import AppError

logger = logging.getLogger(__name__)

GENERIC_ERROR_MESSAGE = "Something went wrong"
DEFAULT_THROTTLE_MESSAGE = "Too many requests, please try again later."


def error_response(message, status_code):
    """The error body the React frontend already expects from the Node API."""
    return Response(
        {"success": False, "message": message, "data": None},
        status=status_code,
    )


def route_not_found_message(request):
    """Same text as Node: 'Route not found: GET /api/v1/whatever?x=1'."""
    if request is None:
        return "Route not found"
    return f"Route not found: {request.method} {request.get_full_path()}"


def _flatten(detail, prefix=""):
    """Turn DRF's nested validation errors into a flat list of strings."""
    messages = []
    if isinstance(detail, dict):
        for key, value in detail.items():
            child_prefix = f"{prefix}.{key}" if prefix else str(key)
            messages.extend(_flatten(value, child_prefix))
    elif isinstance(detail, (list, tuple)):
        for item in detail:
            messages.extend(_flatten(item, prefix))
    else:
        text = str(detail)
        if prefix and prefix not in ("non_field_errors", "detail"):
            text = f"{prefix}: {text}"
        messages.append(text)
    return messages


def _extract_message(exc, data):
    # Normal DRF errors look like {"detail": "..."}.
    if not isinstance(exc, ValidationError) and isinstance(data, dict) and "detail" in data:
        return str(data["detail"])
    # Serializer validation errors (400). PROVISIONAL format, see my notes.
    return ", ".join(_flatten(data)) or GENERIC_ERROR_MESSAGE


def custom_exception_handler(exc, context):
    """
    Replacement for error.middleware.js. Every error leaves the API as
        {"success": false, "message": "...", "data": null}
    except rate-limit errors, which keep Node's own shape
        {"status": "error", "message": "..."}
    """
    request = context.get("request")

    # 1) Errors we raised on purpose
    if isinstance(exc, AppError):
        set_rollback()
        return error_response(exc.message, exc.status_code)

    # 2) Rate limit exceeded (429)
    if isinstance(exc, Throttled):
        set_rollback()
        message = getattr(request, "throttle_message", None) or DEFAULT_THROTTLE_MESSAGE
        response = Response({"status": "error", "message": message}, status=429)
        if exc.wait is not None:
            response["Retry-After"] = str(math.ceil(exc.wait))
        return response

    # 3) Right URL, wrong HTTP method: Express answers 404 here, not 405
    if isinstance(exc, MethodNotAllowed):
        set_rollback()
        return error_response(route_not_found_message(request), 404)

    # 4) Other DRF errors (validation, bad token, forbidden, bad JSON...)
    response = drf_exception_handler(exc, context)
    if response is not None:
        response.data = {
            "success": False,
            "message": _extract_message(exc, response.data),
            "data": None,
        }
        return response

    # 5) A real bug: log it, hide details from the client
    logger.error("UNEXPECTED ERROR: %s", exc, exc_info=exc)
    set_rollback()
    return error_response(GENERIC_ERROR_MESSAGE, 500)