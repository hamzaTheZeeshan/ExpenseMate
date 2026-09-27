import { Prisma } from "@prisma/client";
import prisma from "../config/db.js";

const GRANULARITY_UNITS = new Set(["day", "week", "month"]);

/**
 * Per-category expense totals for a user within [startDate, endDate).
 * Returns raw Prisma groupBy rows: [{ categoryId, _sum: { amount } }, ...]
 * categoryId can be null (transactions with no category). Category
 * name/color are joined in analytics.service.js, not here.
 */
export async function spendingByCategory(userId, startDate, endDate) {
  return prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      type: "expense",
      occurredAt: { gte: startDate, lt: endDate },
    },
    _sum: { amount: true },
  });
}

/**
 * Expense totals bucketed into day/week/month periods within
 * [startDate, endDate). Uses raw SQL because Prisma's groupBy can't
 * truncate a timestamp column natively.
 *
 * `granularity` is checked against a fixed allowlist (GRANULARITY_UNITS)
 * before being interpolated with Prisma.raw — date_trunc's unit argument
 * can't be passed as a normal bind parameter in Postgres. Every other
 * value in the query is a proper bound parameter via the $queryRaw tag.
 *
 * @returns {Promise<{ period: Date, amount: number }[]>}
 */
export async function spendingOverTime(userId, startDate, endDate, granularity) {
  const unit = GRANULARITY_UNITS.has(granularity) ? granularity : "day";

  const rows = await prisma.$queryRaw`
    SELECT date_trunc(${Prisma.raw(`'${unit}'`)}, occurred_at) AS period,
           SUM(amount) AS amount
    FROM transactions
    WHERE user_id = ${userId}::uuid
      AND type = 'expense'
      AND occurred_at >= ${startDate}
      AND occurred_at < ${endDate}
    GROUP BY period
    ORDER BY period ASC
  `;

  return rows.map((row) => ({
    period: row.period,
    amount: Number(row.amount ?? 0),
  }));
}

/**
 * Income and expense totals for a user within [startDate, endDate).
 * @returns {Promise<{ income: number, expense: number }>}
 */
export async function incomeVsExpense(userId, startDate, endDate) {
  const rows = await prisma.transaction.groupBy({
    by: ["type"],
    where: {
      userId,
      occurredAt: { gte: startDate, lt: endDate },
    },
    _sum: { amount: true },
  });

  const income = rows.find((row) => row.type === "income")?._sum.amount ?? 0;
  const expense = rows.find((row) => row.type === "expense")?._sum.amount ?? 0;

  return { income: Number(income), expense: Number(expense) };
}

/**
 * Average monthly expense per category over the last `monthsBack` months
 * (i.e. total expense in that window / monthsBack — not divided by the
 * count of months that actually had transactions, so a category used
 * once doesn't look like it averages that full amount every month).
 *
 * @returns {Promise<{ categoryId: string | null, average: number }[]>}
 */
export async function averageSpendByCategory(userId, monthsBack) {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - monthsBack);

  const rows = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      type: "expense",
      occurredAt: { gte: startDate, lt: endDate },
    },
    _sum: { amount: true },
  });

  return rows.map((row) => ({
    categoryId: row.categoryId,
    average: Number(row._sum.amount ?? 0) / monthsBack,
  }));
}
