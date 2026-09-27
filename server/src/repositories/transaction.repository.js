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
  return prisma.transaction.create({
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
    include: { card: true, category: true },
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

  return prisma.transaction.update({
    where: { id },
    data: updateData,
    include: { card: true, category: true },
  });
}

export async function deleteTransaction(id) {
  return prisma.transaction.delete({ where: { id } });
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
