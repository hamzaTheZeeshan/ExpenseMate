import prisma from "../config/db.js";

// Maps the public (snake_case) sort field name used in `sort=field:dir`
// to the Prisma (camelCase) column name. Keep in sync with
// SORTABLE_FIELDS in validators/transaction.validator.js.
const SORT_FIELD_MAP = {
  occurred_at: "occurredAt",
  amount: "amount",
  created_at: "createdAt",
};

/**
 * Turns a validated "field:direction" string (e.g. "occurred_at:desc")
 * into a Prisma orderBy object. Falls back to occurredAt:desc if missing
 * or malformed — the validator is what actually rejects bad input before
 * it gets here.
 */
function parseSort(sortString) {
  const [field, direction] = (sortString ?? "").split(":");
  const prismaField = SORT_FIELD_MAP[field];
  if (!prismaField || (direction !== "asc" && direction !== "desc")) {
    return { occurredAt: "desc" };
  }
  return { [prismaField]: direction };
}

/**
 * Builds a Prisma `where` clause scoped to a user from the public filter
 * shape used by both listing and aggregation.
 */
function buildWhere(userId, filters = {}) {
  const where = { userId };

  if (filters.type) where.type = filters.type;
  if (filters.category_id) where.categoryId = filters.category_id;
  if (filters.card_id) where.cardId = filters.card_id;

  if (filters.start_date || filters.end_date) {
    where.occurredAt = {};
    if (filters.start_date) where.occurredAt.gte = filters.start_date;
    if (filters.end_date) where.occurredAt.lte = filters.end_date;
  }

  return where;
}

/**
 * Applies (or reverses) a transaction's effect on its card, using the
 * given Prisma transaction client.
 *
 *   expense: creditLimit -= amount, creditUsed += amount
 *   income:  creditLimit += amount
 *
 * Pass reverse = true to undo the effect (used on update and delete).
 * Does nothing if the transaction has no card.
 */
async function applyCardEffect(tx, { cardId, type, amount }, reverse = false) {
  if (!cardId) return;

  let data;
  if (type === "expense") {
    data = reverse
      ? {
          creditLimit: { increment: amount },
          creditUsed: { decrement: amount },
        }
      : {
          creditLimit: { decrement: amount },
          creditUsed: { increment: amount },
        };
  } else if (type === "income") {
    data = {
      creditLimit: reverse ? { decrement: amount } : { increment: amount },
    };
  } else {
    return;
  }

  await tx.card.update({ where: { id: cardId }, data });
}

/**
 * @param {string} userId
 * @param {object} filters - { type, category_id, card_id, start_date, end_date }
 * @param {object} pagination - { page, limit, sort }, sort as "field:direction"
 * @returns {Promise<{ data: object[], total: number }>}
 */
export async function findAllForUser(userId, filters = {}, pagination = {}) {
  const where = buildWhere(userId, filters);
  const { page = 1, limit = 20, sort } = pagination;
  const orderBy = parseSort(sort);

  const [data, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: { card: true, category: true },
    }),
    prisma.transaction.count({ where }),
  ]);

  return { data, total };
}

export async function findById(id) {
  return prisma.transaction.findUnique({
    where: { id },
    include: { card: true, category: true },
  });
}

export async function create(userId, data) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        userId,
        type: data.type,
        amount: data.amount,
        merchant: data.merchant,
        note: data.note,
        cardId: data.card_id ?? null,
        categoryId: data.category_id ?? null,
        occurredAt: data.occurred_at ?? new Date(),
      },
    });

    await applyCardEffect(tx, created);

    // Re-read so the included card reflects the updated limit/used values.
    return tx.transaction.findUnique({
      where: { id: created.id },
      include: { card: true, category: true },
    });
  });
}

export async function update(id, data) {
  const updateData = {};

  if (data.type !== undefined) updateData.type = data.type;
  if (data.amount !== undefined) updateData.amount = data.amount;
  if (data.merchant !== undefined) updateData.merchant = data.merchant;
  if (data.note !== undefined) updateData.note = data.note;
  if (data.card_id !== undefined) updateData.cardId = data.card_id;
  if (data.category_id !== undefined) updateData.categoryId = data.category_id;
  if (data.occurred_at !== undefined) updateData.occurredAt = data.occurred_at;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findUnique({ where: { id } });

    // Undo the old transaction's effect on its (old) card.
    if (existing) await applyCardEffect(tx, existing, true);

    // If the record doesn't exist, this throws as it did before.
    const updated = await tx.transaction.update({
      where: { id },
      data: updateData,
    });

    // Apply the new values to the (possibly different) card.
    await applyCardEffect(tx, updated);

    return tx.transaction.findUnique({
      where: { id },
      include: { card: true, category: true },
    });
  });
}

export async function deleteTransaction(id) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findUnique({ where: { id } });

    const deleted = await tx.transaction.delete({ where: { id } });

    // Deleting a transaction restores the card to how it was before.
    if (existing) await applyCardEffect(tx, existing, true);

    return deleted;
  });
}

export async function isOwnedByUser(id, userId) {
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!transaction) return false;
  return transaction.userId === userId;
}

/**
 * Returns totals grouped by type, scoped to the user and optional filters.
 * Shape: [{ type: 'income', _sum: { amount: Decimal } }, ...]
 * Kept as raw Prisma groupBy output so callers (e.g. a future
 * dashboard/analytics service) can shape it however they need.
 */
export async function sumByTypeForUser(userId, filters = {}) {
  const where = buildWhere(userId, filters);

  return prisma.transaction.groupBy({
    by: ["type"],
    where,
    _sum: { amount: true },
  });
}

/**
 * Sums expense-type transaction amounts for a single user + category,
 * where occurred_at falls within [startDate, endDate] inclusive of start,
 * exclusive of end (so back-to-back budget periods don't double-count the
 * boundary instant). Used by budget.service.js to compute progress.
 *
 * @param {string} userId
 * @param {string} categoryId
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Promise<number>} total spent, as a plain number (0 if none)
 */
export async function sumExpensesForCategoryInRange(
  userId,
  categoryId,
  startDate,
  endDate,
) {
  const result = await prisma.transaction.aggregate({
    where: {
      userId,
      categoryId,
      type: "expense",
      occurredAt: {
        gte: startDate,
        lt: endDate,
      },
    },
    _sum: { amount: true },
  });

  return Number(result._sum.amount ?? 0);
}