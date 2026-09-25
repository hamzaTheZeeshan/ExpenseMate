import { asyncHandler } from "../utils/async-handler.js";
import * as authService from "../services/auth.service.js";
import { toSafeUser } from "../repositories/user.repository.js";
import env from "../config/env.js";

const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: "strict",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, matches jwtRefreshExpiresIn default
  path: "/api/v1/auth", // only sent back on auth routes (refresh/logout)
};

function sendAuthResponse(
  res,
  statusCode,
  { user, accessToken, refreshToken },
  message,
) {
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
  }

  res.status(statusCode).json({
    success: true,
    message,
    data: {
      user: toSafeUser(user),
      accessToken,
    },
  });
}

export const signup = asyncHandler(async (req, res) => {
  const { email, password, full_name } = req.body;
  const result = await authService.signup(email, password, full_name);
  sendAuthResponse(res, 201, result, "Account created successfully");
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  sendAuthResponse(res, 200, result, "Logged in successfully");
});

export const googleAuth = asyncHandler(async (req, res) => {
  const { idToken } = req.body;
  const result = await authService.googleAuth(idToken);
  sendAuthResponse(res, 200, result, "Logged in with Google");
});

export const refreshToken = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "No refresh token provided" });
  }

  const { accessToken, user } = await authService.refreshToken(token);

  res.status(200).json({
    success: true,
    message: "Token refreshed",
    data: { user: toSafeUser(user), accessToken },
  });
});

export const logout = asyncHandler(async (req, res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_OPTIONS.path });
  res
    .status(200)
    .json({ success: true, message: "Logged out successfully", data: null });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  await authService.forgotPassword(email);
  // Same response whether or not the email exists — avoids leaking which
  // emails are registered.
  res.status(200).json({
    success: true,
    message: "If an account with that email exists, a reset link has been sent",
    data: null,
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  await authService.resetPassword(token, newPassword);
  res
    .status(200)
    .json({
      success: true,
      message: "Password reset successfully",
      data: null,
    });
});

export const me = asyncHandler(async (req, res) => {
  res
    .status(200)
    .json({
      success: true,
      message: null,
      data: { user: toSafeUser(req.user) },
    });
});
