from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q

from common.errors import AppError

from .models import Category


def get_categories(user_id):
    return list(
        Category.objects.filter(Q(user__isnull=True) | Q(user_id=user_id)).order_by(
            "-is_default", "name"
        )
    )


def create_category(user_id, data):
    return Category.objects.create(user_id=user_id, is_default=False, **data)


def _find_by_id(category_id):
    try:
        return Category.objects.filter(pk=category_id).first()
    except (DjangoValidationError, ValueError):
        # Malformed UUID: treat as "not found".
        return None


def find_category_by_id(category_id):
    """Returns the Category or None. No ownership check (public, for other apps)."""
    return _find_by_id(category_id)


def _assert_editable(user_id, category_id):
    category = _find_by_id(category_id)

    if category is None:
        raise AppError("Category not found", 404)

    if category.is_default or str(category.user_id) != str(user_id):
        raise AppError("You don't have permission to modify this category", 403)

    return category


def update_category(user_id, category_id, data):
    category = _assert_editable(user_id, category_id)
    for field, value in data.items():
        setattr(category, field, value)
    category.save(update_fields=list(data.keys()))
    return category


def delete_category(user_id, category_id):
    category = _assert_editable(user_id, category_id)
    # DB rules: Transaction.category_id is ON DELETE SET NULL, Budget.category_id
    # is ON DELETE CASCADE. Postgres enforces both.
    category.delete()