import prisma from "../config/db.js";

// The card API surface (validators, service, controller) uses snake_case
// keys — nickname, last_four, credit_limit, is_default, etc. — matching the
// rest of this project's request/response bodies. Prisma's Card model uses
// camelCase field names (lastFour, creditLimit, isDefault...). This map is
// the single translation point between the two. It's exported so
// card.service.js can reuse it for the writes it runs inside a
// prisma.$transaction (where it must call tx.card.* directly rather than
// going through this repository's own functions).
const FIELD_MAP = {
  nickname: "nickname",
  card_type: "cardType",
  last_four: "lastFour",
  expiry_month: "expiryMonth",
  expiry_year: "expiryYear",
  balance: "balance",
  credit_limit: "creditLimit",
  credit_used: "creditUsed",
  currency: "currency",
  color_theme: "colorTheme",
  is_default: "isDefault",
};

export function toPrismaData(data) {
  const mapped = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const prismaKey = FIELD_MAP[key] ?? key;
    mapped[prismaKey] = value;
  }

  return mapped;
}

export async function findAllForUser(userId) {
  return prisma.card.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
}

export async function findById(id) {
  return prisma.card.findUnique({
    where: { id },
  });
}

export async function create(userId, data) {
  return prisma.card.create({
    data: {
      ...toPrismaData(data),
      userId,
    },
  });
}

export async function update(id, data) {
  return prisma.card.update({
    where: { id },
    data: toPrismaData(data),
  });
}

export async function deleteCard(id) {
  return prisma.card.delete({
    where: { id },
  });
}

// Sets is_default: false on all of a user's cards other than excludeCardId.
// Intended to run inside the same transaction as the create/update that
// sets the new default, so exactly one card ends up default.
export async function unsetDefaultForUser(userId, excludeCardId) {
  return prisma.card.updateMany({
    where: {
      userId,
      isDefault: true,
      ...(excludeCardId ? { id: { not: excludeCardId } } : {}),
    },
    data: { isDefault: false },
  });
}

export async function isOwnedByUser(id, userId) {
  const card = await prisma.card.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (!card) return false;
  return card.userId === userId;
}
