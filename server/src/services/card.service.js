import { AppError } from "../utils/app-error.js";
import prisma from "../config/db.js";
import * as cardRepository from "../repositories/card.repository.js";
import { toPrismaData } from "../repositories/card.repository.js";

const LAST_FOUR_RE = /^\d{4}$/;
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

// All input checks for card create/update live here, inline, rather than in
// a separate validator file. `isCreate` relaxes "required" checks for
// partial update payloads.
function validateCardInput(data, { isCreate }) {
  const errors = [];

  if (isCreate && !data.nickname) {
    errors.push("nickname is required");
  }
  if (data.nickname !== undefined) {
    if (typeof data.nickname !== "string" || data.nickname.length > 50) {
      errors.push("nickname must be a string up to 50 characters");
    }
  }

  if (isCreate && data.last_four === undefined) {
    errors.push("last_four is required");
  }
  if (data.last_four !== undefined && !LAST_FOUR_RE.test(data.last_four)) {
    errors.push("last_four must be exactly 4 digits");
  }

  if (data.card_type !== undefined && typeof data.card_type !== "string") {
    errors.push("card_type must be a string");
  }

  if (data.expiry_month !== undefined) {
    const month = Number(data.expiry_month);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      errors.push("expiry_month must be an integer between 1 and 12");
    }
  }

  if (data.expiry_year !== undefined) {
    const year = Number(data.expiry_year);
    const currentYear = new Date().getFullYear();
    if (!Number.isInteger(year) || year < currentYear) {
      errors.push(`expiry_year must be ${currentYear} or later`);
    }
  }

  if (data.balance !== undefined && typeof Number(data.balance) !== "number") {
    errors.push("balance must be a number");
  }

  if (data.credit_limit !== undefined) {
    const limit = Number(data.credit_limit);
    if (Number.isNaN(limit) || limit < 0) {
      errors.push("credit_limit must be a number >= 0");
    }
  }

  if (data.credit_used !== undefined) {
    const used = Number(data.credit_used);
    if (Number.isNaN(used) || used < 0) {
      errors.push("credit_used must be a number >= 0");
    }
  }

  if (data.credit_limit !== undefined && data.credit_used !== undefined) {
    if (Number(data.credit_used) > Number(data.credit_limit)) {
      errors.push("credit_used cannot exceed credit_limit");
    }
  }

  if (data.currency !== undefined && typeof data.currency !== "string") {
    errors.push("currency must be a string");
  }

  if (data.color_theme !== undefined && !HEX_COLOR_RE.test(data.color_theme)) {
    errors.push("color_theme must be a hex value like #A1B2C3");
  }

  if (data.is_default !== undefined && typeof data.is_default !== "boolean") {
    errors.push("is_default must be a boolean");
  }

  if (!isCreate && Object.keys(data).length === 0) {
    errors.push("At least one field must be provided to update");
  }

  // Hard safety rule: never accept a full card number or CVV field, however
  // named. Reject the request outright rather than silently dropping them.
  const forbiddenKeys = ["card_number", "pan", "cvv", "cvc", "number"];
  for (const key of forbiddenKeys) {
    if (data[key] !== undefined) {
      errors.push(`${key} is not accepted — only last_four is allowed`);
    }
  }

  if (errors.length > 0) {
    throw new AppError(errors.join(", "), 400);
  }
}

function applyCreateDefaults(data) {
  return {
    ...data,
    balance: data.balance !== undefined ? data.balance : 0,
    credit_limit: data.credit_limit !== undefined ? data.credit_limit : 0,
    credit_used: data.credit_used !== undefined ? data.credit_used : 0,
    currency: data.currency !== undefined ? data.currency : "USD",
  };
}

export async function getCards(userId) {
  return cardRepository.findAllForUser(userId);
}

async function assertOwnedOrThrow(userId, cardId) {
  const card = await cardRepository.findById(cardId);

  if (!card) {
    throw new AppError("Card not found", 404);
  }

  if (card.userId !== userId) {
    throw new AppError("You don't have permission to access this card", 403);
  }

  return card;
}

export async function getCardById(userId, cardId) {
  return assertOwnedOrThrow(userId, cardId);
}

export async function createCard(userId, rawData) {
  validateCardInput(rawData, { isCreate: true });
  const data = applyCreateDefaults(rawData);

  const existingCards = await cardRepository.findAllForUser(userId);
  const isFirstCard = existingCards.length === 0;

  // First card a user adds is always the default, regardless of what was
  // sent in the payload.
  const shouldBeDefault = isFirstCard || data.is_default === true;

  if (shouldBeDefault && !isFirstCard) {
    // Only need a transaction when we're actually flipping an existing
    // default off — a first card has nothing to unset.
    return prisma.$transaction(async (tx) => {
      await tx.card.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });

      return tx.card.create({
        data: {
          ...toPrismaData(data),
          userId,
          isDefault: true,
        },
      });
    });
  }

  return cardRepository.create(userId, {
    ...data,
    is_default: shouldBeDefault,
  });
}

export async function updateCard(userId, cardId, rawData) {
  await assertOwnedOrThrow(userId, cardId);
  validateCardInput(rawData, { isCreate: false });
  const data = rawData;

  if (data.is_default === true) {
    return prisma.$transaction(async (tx) => {
      await tx.card.updateMany({
        where: {
          userId,
          isDefault: true,
          id: { not: cardId },
        },
        data: { isDefault: false },
      });

      return tx.card.update({
        where: { id: cardId },
        data: toPrismaData(data),
      });
    });
  }

  return cardRepository.update(cardId, data);
}

export async function deleteCard(userId, cardId) {
  const card = await assertOwnedOrThrow(userId, cardId);

  // Transactions referencing this card have card_id set null via the
  // schema's onDelete: SetNull — no extra guard logic needed here.
  await cardRepository.deleteCard(cardId);

  if (card.isDefault) {
    const remainingCards = await cardRepository.findAllForUser(userId);

    if (remainingCards.length > 0) {
      // findAllForUser already orders by isDefault desc, createdAt desc,
      // so the first remaining card is the most recently created one.
      const [mostRecent] = remainingCards;
      await cardRepository.update(mostRecent.id, { is_default: true });
    }
  }
}
