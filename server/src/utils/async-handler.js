// Wraps an async route/controller handler so any rejected promise or thrown
// error is forwarded to Express's error-handling middleware via next(),
// instead of crashing the process or requiring a try/catch in every handler.
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
