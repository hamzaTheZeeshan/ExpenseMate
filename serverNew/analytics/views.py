from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.authentication import JWTAuthentication

from . import services
from .serializers import validate_date_range_query, validate_over_time_query


def _envelope(data):
    return Response(
        {"success": True, "message": None, "data": data}, status=status.HTTP_200_OK
    )


class _AnalyticsBaseView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]


class SpendingByCategoryView(_AnalyticsBaseView):
    def get(self, request):
        filters = validate_date_range_query(request.query_params)
        data = services.get_spending_by_category(
            request.user.pk, filters.get("start_date"), filters.get("end_date")
        )
        return _envelope({"spending_by_category": data})


class SpendingOverTimeView(_AnalyticsBaseView):
    def get(self, request):
        filters = validate_over_time_query(request.query_params)
        data = services.get_spending_over_time(
            request.user.pk,
            filters.get("start_date"),
            filters.get("end_date"),
            filters.get("granularity"),
        )
        return _envelope({"spending_over_time": data})


class IncomeVsExpenseView(_AnalyticsBaseView):
    def get(self, request):
        filters = validate_date_range_query(request.query_params)
        data = services.get_income_vs_expense(
            request.user.pk, filters.get("start_date"), filters.get("end_date")
        )
        # Not wrapped in a key, as in Node.
        return _envelope(data)


class SpendingRadarView(_AnalyticsBaseView):
    def get(self, request):
        return _envelope({"radar": services.get_spending_radar(request.user.pk)})