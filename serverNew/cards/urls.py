from django.urls import re_path

from .views import CardDetailView, CardListCreateView

# Mounted at "api/v1/" in config/urls.py. Optional trailing slash mirrors Express.
urlpatterns = [
    re_path(r"^cards/?$", CardListCreateView.as_view(), name="card-list-create"),
    re_path(
        r"^cards/(?P<card_id>[^/]+)/?$",
        CardDetailView.as_view(),
        name="card-detail",
    ),
]