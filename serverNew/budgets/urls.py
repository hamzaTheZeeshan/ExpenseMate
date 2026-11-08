from django.urls import re_path

from .views import BudgetDetailView, BudgetListCreateView

# Mounted at "api/v1/" in config/urls.py. Optional trailing slash mirrors Express.
urlpatterns = [
    re_path(
        r"^budgets/?$",
        BudgetListCreateView.as_view(),
        name="budget-list-create",
    ),
    re_path(
        r"^budgets/(?P<budget_id>[^/]+)/?$",
        BudgetDetailView.as_view(),
        name="budget-detail",
    ),
]