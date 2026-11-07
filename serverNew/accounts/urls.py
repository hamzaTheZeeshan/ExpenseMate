from django.urls import re_path

from accounts import views

# `/?$` accepts an optional trailing slash, like Express does.
urlpatterns = [
    re_path(r"^signup/?$", views.SignupView.as_view()),
    re_path(r"^login/?$", views.LoginView.as_view()),
    re_path(r"^google/?$", views.GoogleAuthView.as_view()),
    re_path(r"^refresh/?$", views.RefreshTokenView.as_view()),
    re_path(r"^logout/?$", views.LogoutView.as_view()),
    re_path(r"^forgot-password/?$", views.ForgotPasswordView.as_view()),
    re_path(r"^reset-password/?$", views.ResetPasswordView.as_view()),
    re_path(r"^me/?$", views.MeView.as_view()),
]