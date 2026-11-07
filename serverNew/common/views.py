from django.http import JsonResponse
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from common.errors import AppError
from common.exceptions import GENERIC_ERROR_MESSAGE, route_not_found_message


class ApiRootView(APIView):
    """GET /api/v1  ->  {"message": "ExpenseMate API v1"}"""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"message": "ExpenseMate API v1"})


class RouteNotFoundView(APIView):
    """
    Catch-all placed LAST in config/urls.py. Replaces not-found.middleware.js:
    any URL no other route matched ends up here and gets the Node-style 404.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def handle_any_method(self, request, *args, **kwargs):
        raise AppError(route_not_found_message(request), 404)

    get = post = put = patch = delete = head = options = handle_any_method


# Safety nets for errors that happen outside DRF (only used when DEBUG=False).
def handler404(request, exception=None):
    return JsonResponse(
        {"success": False, "message": route_not_found_message(request), "data": None},
        status=404,
    )


def handler500(request):
    return JsonResponse(
        {"success": False, "message": GENERIC_ERROR_MESSAGE, "data": None},
        status=500,
    )