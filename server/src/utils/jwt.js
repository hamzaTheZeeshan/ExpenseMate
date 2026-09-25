import jwt from "jsonwebtoken";
import env from "../config/env.js";

export function signAccessToken(payload) {
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessExpiresIn,
  });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn,
  });
}

// Both throw (jsonwebtoken's default behavior) on invalid or expired tokens —
// callers should let that propagate to asyncHandler / the error middleware,
// or catch explicitly if they need custom handling.
export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}
