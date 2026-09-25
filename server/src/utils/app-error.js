// Operational error — anything we throw on purpose (bad input, not found,
// conflict, unauthorized, etc.) as opposed to a genuine bug/crash. The
// error middleware checks `isOperational` to decide whether to expose the
// message to the client or return a generic 500.
export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}
