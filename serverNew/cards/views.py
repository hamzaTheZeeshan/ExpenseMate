from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.authentication import JWTAuthentication

from . import services
from .serializers import CardSerializer


def _envelope(http_status, message, data):
    return Response(
        {"success": True, "message": message, "data": data}, status=http_status
    )


def _body(request):
    data = request.data
    if hasattr(data, "dict"):  # form-encoded QueryDict
        data = data.dict()
    return data if isinstance(data, dict) else {}


class _CardBaseView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]


class CardListCreateView(_CardBaseView):
    def get(self, request):
        cards = services.get_cards(request.user.pk)
        return _envelope(
            status.HTTP_200_OK,
            None,
            {"cards": CardSerializer(cards, many=True).data},
        )

    def post(self, request):
        card = services.create_card(request.user.pk, _body(request))
        return _envelope(
            status.HTTP_201_CREATED,
            "Card created successfully",
            {"card": CardSerializer(card).data},
        )


class CardDetailView(_CardBaseView):
    def get(self, request, card_id):
        card = services.get_card_by_id(request.user.pk, card_id)
        return _envelope(
            status.HTTP_200_OK, None, {"card": CardSerializer(card).data}
        )

    def patch(self, request, card_id):
        card = services.update_card(request.user.pk, card_id, _body(request))
        return _envelope(
            status.HTTP_200_OK,
            "Card updated successfully",
            {"card": CardSerializer(card).data},
        )

    def delete(self, request, card_id):
        services.delete_card(request.user.pk, card_id)
        return _envelope(status.HTTP_200_OK, "Card deleted successfully", None)