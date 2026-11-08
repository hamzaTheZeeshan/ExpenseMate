from rest_framework import serializers

from common.formatting import decimal_string, iso_datetime


class CardSerializer(serializers.Serializer):
    """Output only. Emits the exact camelCase keys Prisma returned."""

    def to_representation(self, instance):
        return {
            "id": str(instance.id),
            "userId": str(instance.user_id),
            "nickname": instance.nickname,
            "cardType": instance.card_type,
            "lastFour": instance.last_four,
            "expiryMonth": instance.expiry_month,
            "expiryYear": instance.expiry_year,
            "balance": decimal_string(instance.balance),
            "creditLimit": decimal_string(instance.credit_limit),
            "creditUsed": decimal_string(instance.credit_used),
            "currency": instance.currency,
            "colorTheme": instance.color_theme,
            "isDefault": instance.is_default,
            "createdAt": iso_datetime(instance.created_at),
            "updatedAt": iso_datetime(instance.updated_at),
        }