from django.urls import re_path

from .views import CategoryDetailView, CategoryListCreateView

# Mounted at "api/v1/" in config/urls.py. Optional trailing slash mirrors
# Express, which matches "/categories" and "/categories/" alike.
urlpatterns = [
    re_path(
        r"^categories/?$",
        CategoryListCreateView.as_view(),
        name="category-list-create",
    ),
    re_path(
        r"^categories/(?P<category_id>[^/]+)/?$",
        CategoryDetailView.as_view(),
        name="category-detail",
    ),
]