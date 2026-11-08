from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.authentication import JWTAuthentication

from . import services
from .serializers import (
    CategoryCreateSerializer,
    CategorySerializer,
    CategoryUpdateSerializer,
)


def _envelope(http_status, message, data):
    return Response(
        {"success": True, "message": message, "data": data}, status=http_status
    )


class _CategoryBaseView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]


class CategoryListCreateView(_CategoryBaseView):
    def get(self, request):
        categories = services.get_categories(request.user.pk)
        return _envelope(
            status.HTTP_200_OK,
            None,
            {"categories": CategorySerializer(categories, many=True).data},
        )

    def post(self, request):
        serializer = CategoryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = services.create_category(request.user.pk, serializer.validated_data)
        return _envelope(
            status.HTTP_201_CREATED,
            "Category created successfully",
            {"category": CategorySerializer(category).data},
        )


class CategoryDetailView(_CategoryBaseView):
    def patch(self, request, category_id):
        serializer = CategoryUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = services.update_category(
            request.user.pk, category_id, serializer.validated_data
        )
        return _envelope(
            status.HTTP_200_OK,
            "Category updated successfully",
            {"category": CategorySerializer(category).data},
        )

    def delete(self, request, category_id):
        services.delete_category(request.user.pk, category_id)
        return _envelope(status.HTTP_200_OK, "Category deleted successfully", None)