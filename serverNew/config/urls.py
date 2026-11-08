from django.urls import include, path, re_path

from common.views import ApiRootView, RouteNotFoundView

# Everything under /api/v1. Feature routes are added here one app at a time
# as each is converted (categories, cards, transactions, budgets,
# analytics, dashboard).
api_patterns = [
    path("", ApiRootView.as_view()),
    path("auth/", include("accounts.urls")),
]

urlpatterns = [
    path("api/v1", ApiRootView.as_view()),
    path("api/v1/", include(api_patterns)),
    path("api/v1/", include("categories.urls")),  
    path("api/v1/", include("cards.urls")), 
    path("api/v1/", include("transactions.urls")),
    path("api/v1/", include("budgets.urls")), 
    path("api/v1/", include("analytics.urls")),
    path("api/v1/", include("dashboard.urls")),
    # Must stay last: anything not matched above gets the Node-style 404 JSON.
    re_path(r"^.*$", RouteNotFoundView.as_view()),
]

handler404 = "common.views.handler404"
handler500 = "common.views.handler500"