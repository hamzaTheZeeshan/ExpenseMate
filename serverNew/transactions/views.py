import math

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.authentication import JWTAuthentication

from . import services
from .serializers import (
    TransactionSerializer,
    validate_create_body,
    validate_list_query,
    validate_update_body,
)


def _envelope(http_status, message, data):
    return Response(
        {"success": True, "message": message, "data": data}, status=http_status
    )


class _TransactionBaseView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]


class TransactionListCreateView(_TransactionBaseView):
    def get(self, request):
        filters, pagination = validate_list_query(request.query_params)
        rows, total = services.get_transactions(request.user.pk, filters, pagination)
        return _envelope(
            status.HTTP_200_OK,
            None,
            {
                "transactions": TransactionSerializer(rows, many=True).data,
                "pagination": {
                    "page": pagination["page"],
                    "limit": pagination["limit"],
                    "total": total,
                    "totalPages": math.ceil(total / pagination["limit"]),
                },
            },
        )

    def post(self, request):
        data = validate_create_body(request.data)
        created = services.create_transaction(request.user.pk, data)
        return _envelope(
            status.HTTP_201_CREATED,
            "Transaction created successfully",
            {"transaction": TransactionSerializer(created).data},
        )


class TransactionDetailView(_TransactionBaseView):
    def get(self, request, transaction_id):
        row = services.get_transaction_by_id(request.user.pk, transaction_id)
        return _envelope(
            status.HTTP_200_OK, None, {"transaction": TransactionSerializer(row).data}
        )

    def patch(self, request, transaction_id):
        data = validate_update_body(request.data)
        row = services.update_transaction(request.user.pk, transaction_id, data)
        return _envelope(
            status.HTTP_200_OK,
            "Transaction updated successfully",
            {"transaction": TransactionSerializer(row).data},
        )

    def delete(self, request, transaction_id):
        services.delete_transaction(request.user.pk, transaction_id)
        return _envelope(status.HTTP_200_OK, "Transaction deleted successfully", None)