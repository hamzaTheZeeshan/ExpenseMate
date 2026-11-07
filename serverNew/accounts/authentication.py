import jwt
from rest_framework.authentication import BaseAuthentication

from accounts.services import find_user_by_id
from accounts.tokens import verify_access_token
from common.errors import AppError


class JWTAuthentication(BaseAuthentication):
    """
    Replacement for auth.middleware.js (protect). Same three 401 messages.
    Raising AppError here makes every protected route return Node's error shape.
    """

    def authenticate(self, request):
        header = request.headers.get("Authorization")
        if not header or not header.startswith("Bearer "):
            raise AppError("Not authenticated", 401)

        token = header.split(" ")[1]

        try:
            decoded = verify_access_token(token)
        except jwt.PyJWTError:
            raise AppError("Invalid or expired token", 401)

        user = find_user_by_id(decoded.get("sub"))
        if not user:
            raise AppError("User no longer exists", 401)

        return (user, token)