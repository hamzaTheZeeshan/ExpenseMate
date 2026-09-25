import rateLimit from "express-rate-limit";

// General-purpose limiter applied globally in app.js.
// Individual routes (e.g. auth login/register) can layer a stricter,
// route-specific limiter on top of this later if needed.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many requests, please try again later.",
  },
});
