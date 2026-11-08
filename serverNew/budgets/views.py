from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.authentication import JWTAuthentication

from . import services
from .serializers import (
    BudgetSerializer,
    BudgetWithProgressSerializer,
    validate_create_body,
    validate_list_query,
    validate_update_body,
)


def _envelope(http_status, message, data):
    return Response(
        {"success": True, "message": message, "data": data}, status=http_status
    )


class _BudgetBaseView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]


class BudgetListCreateView(_BudgetBaseView):
    def get(self, request):
        filters = validate_list_query(request.query_params)
        budgets = services.get_budgets(request.user.pk, filters)
        return _envelope(
            status.HTTP_200_OK,
            None,
            {"budgets": BudgetWithProgressSerializer(budgets, many=True).data},
        )

    def post(self, request):
        data = validate_create_body(request.data)
        budget = services.create_budget(request.user.pk, data)
        return _envelope(
            status.HTTP_201_CREATED,
            "Budget created successfully",
            {"budget": BudgetSerializer(budget).data},
        )


class BudgetDetailView(_BudgetBaseView):
    def get(self, request, budget_id):
        budget = services.get_budget_by_id(request.user.pk, budget_id)
        return _envelope(
            status.HTTP_200_OK,
            None,
            {"budget": BudgetWithProgressSerializer(budget).data},
        )

    def patch(self, request, budget_id):
        data = validate_update_body(request.data)
        budget = services.update_budget(request.user.pk, budget_id, data)
        return _envelope(
            status.HTTP_200_OK,
            "Budget updated successfully",
            {"budget": BudgetSerializer(budget).data},
        )

    def delete(self, request, budget_id):
        services.delete_budget(request.user.pk, budget_id)
        return _envelope(status.HTTP_200_OK, "Budget deleted successfully", None)