from django.core.validators import RegexValidator
from rest_framework import serializers

from common.formatting import iso_datetime

HEX_COLOR_PATTERN = r"^#[0-9A-Fa-f]{6}$"
HEX_COLOR_MESSAGE = "Color must be a hex value like #A1B2C3"


def _color_field():
    return serializers.CharField(
        required=False,
        trim_whitespace=False,
        validators=[RegexValidator(HEX_COLOR_PATTERN, message=HEX_COLOR_MESSAGE)],
    )


class CategoryCreateSerializer(serializers.Serializer):
    # Unknown keys are dropped by DRF, matching "unknown fields stripped".
    name = serializers.CharField(max_length=50, trim_whitespace=False)
    icon = serializers.CharField(required=False, trim_whitespace=False)
    color = _color_field()


class CategoryUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=50, required=False, trim_whitespace=False)
    icon = serializers.CharField(required=False, trim_whitespace=False)
    color = _color_field()

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError(
                "At least one field must be provided to update"
            )
        return attrs


class CategorySerializer(serializers.Serializer):
    """Output only. Emits the exact camelCase keys Prisma returned."""

    def to_representation(self, instance):
        return {
            "id": str(instance.id),
            "userId": str(instance.user_id) if instance.user_id else None,
            "name": instance.name,
            "icon": instance.icon,
            "color": instance.color,
            "isDefault": instance.is_default,
            "createdAt": iso_datetime(instance.created_at),
        }