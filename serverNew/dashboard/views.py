from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.authentication import JWTAuthentication
from budgets.serializers import BudgetWithProgressSerializer
from cards.serializers import CardSerializer
from transactions.serializers import TransactionSerializer

from . import services


class DashboardSummaryView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        summary = services.get_dashboard_summary(request.user.pk)
        data = {
            "recent_transactions": TransactionSerializer(
                summary["recent_transactions"], many=True
            ).data,
            "cards": CardSerializer(summary["cards"], many=True).data,
            "active_budgets": BudgetWithProgressSerializer(
                summary["active_budgets"], many=True
            ).data,
            "total_balance": summary["total_balance"],
            "month_summary": summary["month_summary"],
        }
        # The summary is the data object itself, not wrapped in a key (as in Node).
        return Response(
            {"success": True, "message": None, "data": data},
            status=status.HTTP_200_OK,
        )