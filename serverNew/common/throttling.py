from rest_framework.throttling import SimpleRateThrottle


class _IpWindowThrottle(SimpleRateThrottle):
    """
    Counts requests per IP inside a fixed window, like express-rate-limit.
    DRF's built-in rates only allow s/m/h/d, so the numbers live in the
    two class attributes below instead of a "300/15min" string.
    """

    rate = "custom"  # any non-empty value; parse_rate below ignores it
    max_requests = 0
    window_seconds = 0
    message = ""

    def parse_rate(self, rate):
        return (self.max_requests, self.window_seconds)

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }

    def allow_request(self, request, view):
        allowed = super().allow_request(request, view)
        # Remember which limiter fired first so the exception handler can
        # use the right message (the first one wins, as in Express).
        if not allowed and getattr(request, "throttle_message", None) is None:
            request.throttle_message = self.message
        return allowed


class ApiRateThrottle(_IpWindowThrottle):
    """apiLimiter: 300 requests / 15 min / IP. Applied to every endpoint."""

    scope = "api"
    max_requests = 300
    window_seconds = 15 * 60
    message = "Too many requests, please try again later."


class AuthRateThrottle(_IpWindowThrottle):
    """authLimiter: 20 requests / 15 min / IP. Login, signup, Google sign-in."""

    scope = "auth"
    max_requests = 20
    window_seconds = 15 * 60
    message = "Too many attempts, please try again later."


# In Express the global limiter runs first and the auth limiter is stacked on
# top of it. Auth views will set: throttle_classes = AUTH_THROTTLE_CLASSES
AUTH_THROTTLE_CLASSES = [ApiRateThrottle, AuthRateThrottle]