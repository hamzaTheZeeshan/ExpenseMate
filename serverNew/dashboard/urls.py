from django.urls import re_path

from .views import DashboardSummaryView

# Mounted at "api/v1/" in config/urls.py. Optional trailing slash mirrors Express.
urlpatterns = [
    re_path(
        r"^dashboard/?$",
        DashboardSummaryView.as_view(),
        name="dashboard-summary",
    ),
]