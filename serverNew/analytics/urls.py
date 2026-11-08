from django.urls import re_path

from .views import (
    IncomeVsExpenseView,
    SpendingByCategoryView,
    SpendingOverTimeView,
    SpendingRadarView,
)

# Mounted at "api/v1/" in config/urls.py. Optional trailing slash mirrors Express.
urlpatterns = [
    re_path(
        r"^analytics/spending-by-category/?$",
        SpendingByCategoryView.as_view(),
        name="analytics-spending-by-category",
    ),
    re_path(
        r"^analytics/spending-over-time/?$",
        SpendingOverTimeView.as_view(),
        name="analytics-spending-over-time",
    ),
    re_path(
        r"^analytics/income-vs-expense/?$",
        IncomeVsExpenseView.as_view(),
        name="analytics-income-vs-expense",
    ),
    re_path(
        r"^analytics/spending-radar/?$",
        SpendingRadarView.as_view(),
        name="analytics-spending-radar",
    ),
]