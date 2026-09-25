import { verifyAccessToken } from "../utils/jwt.js";
import { AppError } from "../utils/app-error.js";
import * as userRepository from "../repositories/user.repository.js";
import { asyncHandler } from "../utils/async-handler.js";

export const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("Not authenticated", 401);
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    throw new AppError("Invalid or expired token", 401);
  }

  const user = await userRepository.findById(decoded.sub);
  if (!user) {
    throw new AppError("User no longer exists", 401);
  }

  req.user = user;
  next();
});
