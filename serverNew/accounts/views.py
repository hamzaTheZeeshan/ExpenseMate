from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import services
from accounts.serializers import (
    ForgotPasswordSerializer,
    GoogleAuthSerializer,
    LoginSerializer,
    ResetPasswordSerializer,
    SignupSerializer,
    to_safe_user,
)
from common.throttling import AUTH_THROTTLE_CLASSES
from config.env import env

REFRESH_COOKIE_NAME = "refreshToken"
REFRESH_COOKIE_PATH = "/api/v1/auth"  # only sent back on auth routes
REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days, like Node


def send_auth_response(status_code, result, message):
    response = Response(
        {
            "success": True,
            "message": message,
            "data": {
                "user": to_safe_user(result["user"]),
                "accessToken": result["access_token"],
            },
        },
        status=status_code,
    )
    refresh = result.get("refresh_token")
    if refresh:
        response.set_cookie(
            REFRESH_COOKIE_NAME,
            refresh,
            max_age=REFRESH_COOKIE_MAX_AGE,
            httponly=True,
            secure=not env.debug,  # Node: secure only in production
            samesite="Strict",
            path=REFRESH_COOKIE_PATH,
        )
    return response


class _PublicView(APIView):
    """Routes that do not need a token (no `protect` in the Node router)."""

    authentication_classes = []
    permission_classes = [AllowAny]


class SignupView(_PublicView):
    throttle_classes = AUTH_THROTTLE_CLASSES

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = services.signup(data["email"], data["password"], data["full_name"])
        return send_auth_response(201, result, "Account created successfully")


class LoginView(_PublicView):
    throttle_classes = AUTH_THROTTLE_CLASSES

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = services.login(data["email"], data["password"])
        return send_auth_response(200, result, "Logged in successfully")


class GoogleAuthView(_PublicView):
    throttle_classes = AUTH_THROTTLE_CLASSES

    def post(self, request):
        serializer = GoogleAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = services.google_auth(serializer.validated_data["idToken"])
        return send_auth_response(200, result, "Logged in with Google")


class RefreshTokenView(_PublicView):
    def post(self, request):
        token = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if not token:
            # Node returns this one WITHOUT a "data" key. Copied exactly.
            return Response(
                {"success": False, "message": "No refresh token provided"},
                status=401,
            )

        result = services.refresh_token(token)
        return Response(
            {
                "success": True,
                "message": "Token refreshed",
                "data": {
                    "user": to_safe_user(result["user"]),
                    "accessToken": result["access_token"],
                },
            }
        )


class LogoutView(_PublicView):
    def post(self, request):
        response = Response(
            {"success": True, "message": "Logged out successfully", "data": None}
        )
        response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
        return response


class ForgotPasswordView(_PublicView):
    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.forgot_password(serializer.validated_data["email"])
        # Same response whether or not the email exists.
        return Response(
            {
                "success": True,
                "message": "If an account with that email exists, a reset link has been sent",
                "data": None,
            }
        )


class ResetPasswordView(_PublicView):
    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        services.reset_password(data["token"], data["newPassword"])
        return Response(
            {"success": True, "message": "Password reset successfully", "data": None}
        )


class MeView(APIView):
    # Uses the default JWTAuthentication + IsAuthenticated (this is `protect`).
    def get(self, request):
        return Response(
            {
                "success": True,
                "message": None,
                "data": {"user": to_safe_user(request.user)},
            }
        )