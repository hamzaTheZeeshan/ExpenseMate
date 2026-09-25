import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";

import env from "../config/env.js";
import { AppError } from "../utils/app-error.js";
import { hashPassword, comparePassword } from "../utils/password.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js";
import * as userRepository from "../repositories/user.repository.js";

const googleClient = env.googleClientId
  ? new OAuth2Client(env.googleClientId)
  : null;

function issueTokens(user) {
  const payload = { sub: user.id, email: user.email };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export async function signup(email, password, fullName) {
  const existing = await userRepository.findByEmail(email);
  if (existing) {
    throw new AppError("An account with this email already exists", 409);
  }

  const passwordHash = await hashPassword(password);
  const user = await userRepository.create({
    email,
    passwordHash,
    fullName,
    provider: "local",
  });

  const tokens = issueTokens(user);
  return { user, ...tokens };
}

export async function login(email, password) {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  if (user.provider !== "local") {
    throw new AppError(
      `This account uses ${user.provider} sign-in. Please continue with ${user.provider}.`,
      400,
    );
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError("Invalid email or password", 401);
  }

  const tokens = issueTokens(user);
  return { user, ...tokens };
}

export async function googleAuth(idToken) {
  if (!googleClient) {
    throw new AppError("Google sign-in is not configured", 500);
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: env.googleClientId,
  });
  const payload = ticket.getPayload();
  if (!payload) {
    throw new AppError("Invalid Google token", 401);
  }

  // Google can issue tokens for unverified email addresses (e.g. an invite
  // pending confirmation). Refuse those outright — we never want to create
  // or match an account against an email the holder hasn't proven control of.
  if (payload.email_verified === false) {
    throw new AppError("Google account email is not verified", 401);
  }

  const { sub: googleId, email, name, picture } = payload;

  // Case A: already linked — normal login.
  let user = await userRepository.findByGoogleId(googleId);
  if (user) {
    const tokens = issueTokens(user);
    return { user, ...tokens };
  }

  // Case B: no googleId match, but a local (password-based) account already
  // owns this email. Do NOT auto-link and do NOT log in — that would let
  // anyone who can obtain a Google-verified token for this address (not
  // necessarily the account owner) take over an existing password account.
  // Point them at password login instead.
  const existingByEmail = await userRepository.findByEmail(email);
  if (existingByEmail && existingByEmail.provider === "local") {
    throw new AppError(
      "An account already exists with this email. Please sign in with your password.",
      409,
    );
  }

  // Case C: no user by googleId or email — brand new Google-only signup.
  // (This also covers the edge case where existingByEmail.provider is
  // already 'google' but somehow lacked a googleId match above — treat any
  // non-local existing-by-email match the same way a fresh signup would be
  // unsafe to silently repurpose, so we fall through to creating/using it
  // via googleId only, never by email identity alone.)
  user = await userRepository.create({
    email,
    fullName: name,
    avatarUrl: picture,
    provider: "google",
    googleId,
    passwordHash: null,
  });

  const tokens = issueTokens(user);
  return { user, ...tokens };
}

export async function refreshToken(token) {
  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch (err) {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  const user = await userRepository.findById(decoded.sub);
  if (!user) {
    throw new AppError("User no longer exists", 401);
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  return { accessToken, user };
}

export async function forgotPassword(email) {
  const user = await userRepository.findByEmail(email);
  // Don't reveal whether the email exists — respond the same way either way.
  if (!user) return;

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await userRepository.setResetToken(user.id, hashedToken, expiresAt);

  // TODO: wire up a real email service. For now, log the reset link so the
  // flow is testable end-to-end in dev.
  const resetLink = `${env.clientUrl}/reset-password?token=${rawToken}`;
  console.log(`[auth] Password reset link for ${email}: ${resetLink}`);
}

export async function resetPassword(token, newPassword) {
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  const user = await userRepository.findByResetToken(hashedToken);

  if (!user) {
    throw new AppError("Reset token is invalid or has expired", 400);
  }

  const passwordHash = await hashPassword(newPassword);
  await userRepository.updatePassword(user.id, passwordHash);
  await userRepository.clearResetToken(user.id);
}
