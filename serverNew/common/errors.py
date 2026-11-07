class AppError(Exception):
    """
    Operational error: something we raise on purpose (bad input, not found,
    conflict, unauthorized...). Same idea as AppError in the Node app.

        raise AppError("Email already in use", 409)

    The exception handler in common/exceptions.py turns it into:
        {"success": false, "message": "...", "data": null}
    Any other exception is treated as a bug and returns a generic 500.
    """

    is_operational = True

    def __init__(self, message, status_code=500):
        super().__init__(message)
        self.message = message
        self.status_code = status_code