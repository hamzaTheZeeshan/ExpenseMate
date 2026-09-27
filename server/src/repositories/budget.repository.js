import prisma from "../config/db.js";

// The budget API surface uses snake_case (category_id, start_date,
// end_date...). Prisma's Budget model uses camelCase. This map is the
// single translation point, same pattern as card.repository.js.
const FIELD_MAP = {
  category_id: "categoryId",
  amount: "amount",
  period: "period",
  start_date: "startDate",
  end_date: "endDate",
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

function buildWhere(userId, filters = {}) {
  const where = { userId };

  if (filters.category_id) where.categoryId = filters.category_id;
  if (filters.period) where.period = filters.period;

  if (filters.active) {
    const now = new Date();
    where.startDate = { lte: now };
    where.OR = [{ endDate: null }, { endDate: { gte: now } }];
  }

  return where;
}

export async function findAllForUser(userId, filters = {}) {
  return prisma.budget.findMany({
    where: buildWhere(userId, filters),
    orderBy: { startDate: "desc" },
    include: { category: true },
  });
}

export async function findById(id) {
  return prisma.budget.findUnique({
    where: { id },
    include: { category: true },
  });
}

export async function create(userId, data) {
  return prisma.budget.create({
    data: {
      ...toPrismaData(data),
      userId,
    },
    include: { category: true },
  });
}

export async function update(id, data) {
  return prisma.budget.update({
    where: { id },
    data: toPrismaData(data),
    include: { category: true },
  });
}

export async function deleteBudget(id) {
  return prisma.budget.delete({
    where: { id },
  });
}

export async function isOwnedByUser(id, userId) {
  const budget = await prisma.budget.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (!budget) return false;
  return budget.userId === userId;
}
