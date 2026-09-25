import prisma from "../config/db.js";

// Fields safe to send to the client — excludes password_hash and reset
// token/expiry, which should never leave the server.
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  provider: true,
  googleId: true,
  fullName: true,
  avatarUrl: true,
  currency: true,
  isEmailVerified: true,
  createdAt: true,
  updatedAt: true,
};

export function toSafeUser(user) {
  if (!user) return null;
  const { passwordHash, resetPasswordToken, resetPasswordExpires, ...safe } =
    user;
  return safe;
}

export async function findByEmail(email) {
  return prisma.user.findUnique({ where: { email } });
}

export async function findById(id) {
  return prisma.user.findUnique({ where: { id } });
}

export async function findByGoogleId(googleId) {
  return prisma.user.findUnique({ where: { googleId } });
}

export async function create({
  email,
  passwordHash,
  fullName,
  provider = "local",
  googleId = null,
  avatarUrl = null,
}) {
  return prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName,
      provider,
      googleId,
      avatarUrl,
    },
  });
}

export async function updatePassword(id, passwordHash) {
  return prisma.user.update({
    where: { id },
    data: { passwordHash },
  });
}

export async function linkGoogleId(id, googleId) {
  return prisma.user.update({
    where: { id },
    data: { googleId, provider: "google" },
  });
}

export async function setResetToken(id, hashedToken, expiresAt) {
  return prisma.user.update({
    where: { id },
    data: {
      resetPasswordToken: hashedToken,
      resetPasswordExpires: expiresAt,
    },
  });
}

export async function clearResetToken(id) {
  return prisma.user.update({
    where: { id },
    data: {
      resetPasswordToken: null,
      resetPasswordExpires: null,
    },
  });
}

export async function findByResetToken(hashedToken) {
  return prisma.user.findFirst({
    where: {
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { gt: new Date() },
    },
  });
}

export async function verifyEmail(id) {
  return prisma.user.update({
    where: { id },
    data: { isEmailVerified: true },
  });
}
