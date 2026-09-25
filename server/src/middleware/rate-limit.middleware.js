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

// Stricter limiter for credential-guessing / account-enumeration surfaces:
// login, signup, and Google sign-in (which reveals whether an email is
// already registered as a local account via its 409 response).
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many attempts, please try again later.",
  },
});
