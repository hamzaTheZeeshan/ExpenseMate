from django.urls import re_path

from .views import TransactionDetailView, TransactionListCreateView

# Mounted at "api/v1/" in config/urls.py. Optional trailing slash mirrors Express.
urlpatterns = [
    re_path(
        r"^transactions/?$",
        TransactionListCreateView.as_view(),
        name="transaction-list-create",
    ),
    re_path(
        r"^transactions/(?P<transaction_id>[^/]+)/?$",
        TransactionDetailView.as_view(),
        name="transaction-detail",
    ),
]