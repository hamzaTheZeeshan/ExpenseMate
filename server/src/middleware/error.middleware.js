export default function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational ?? false;

  if (!isOperational) {
    console.error("UNEXPECTED ERROR:", err);
  }

  res.status(statusCode).json({
    success: false,
    message: isOperational ? err.message : "Something went wrong",
    data: null,
  });
}
