import * as analyticsRepository from "../repositories/analytics.repository.js";
import * as categoryRepository from "../repositories/category.repository.js";
import { addDays } from "../utils/date.js";

const RADAR_MONTHS_BACK = 6;
const DEFAULT_SPENDING_OVER_TIME_DAYS = 30;

// Local to this service for now — utils/date.js only has relative-offset
// helpers (addDays/addMonths/addYears), nothing calendar-aware like
// "start of this month" yet. Promote these to utils/date.js if another
// module ends up needing the same "current month" default.
function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startOfNextMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

// Rounds to 2 decimal places, matching how money is handled elsewhere
// (e.g. budget.service.js's percent_used rounding).
function roundCurrency(amount) {
  return Math.round(amount * 100) / 100;
}

export async function getSpendingByCategory(userId, { startDate, endDate } = {}) {
  const rangeStart = startDate ?? startOfCurrentMonth();
  const rangeEnd = endDate ?? startOfNextMonth();

  const [rows, categories] = await Promise.all([
    analyticsRepository.spendingByCategory(userId, rangeStart, rangeEnd),
    categoryRepository.findAllForUser(userId),
  ]);

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return rows.map((row) => {
    const category = row.categoryId ? categoryById.get(row.categoryId) : null;
    return {
      category_id: row.categoryId,
      name: category?.name ?? "Uncategorized",
      color: category?.color ?? null,
      amount: roundCurrency(Number(row._sum.amount ?? 0)),
    };
  });
}

export async function getSpendingOverTime(userId, { startDate, endDate, granularity } = {}) {
  const rangeEnd = endDate ?? new Date();
  const rangeStart = startDate ?? addDays(rangeEnd, -DEFAULT_SPENDING_OVER_TIME_DAYS);
  const unit = granularity ?? "day";

  const rows = await analyticsRepository.spendingOverTime(userId, rangeStart, rangeEnd, unit);

  return rows.map((row) => ({
    period: row.period,
    amount: roundCurrency(row.amount),
  }));
}

export async function getIncomeVsExpense(userId, { startDate, endDate } = {}) {
  const rangeStart = startDate ?? startOfCurrentMonth();
  const rangeEnd = endDate ?? startOfNextMonth();

  const { income, expense } = await analyticsRepository.incomeVsExpense(userId, rangeStart, rangeEnd);

  return {
    income: roundCurrency(income),
    expense: roundCurrency(expense),
    net: roundCurrency(income - expense),
  };
}

export async function getSpendingRadar(userId) {
  const rangeStart = startOfCurrentMonth();
  const rangeEnd = startOfNextMonth();

  const [thisMonthRows, averageRows, categories] = await Promise.all([
    analyticsRepository.spendingByCategory(userId, rangeStart, rangeEnd),
    analyticsRepository.averageSpendByCategory(userId, RADAR_MONTHS_BACK),
    categoryRepository.findAllForUser(userId),
  ]);

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const thisMonthByCategory = new Map(
    thisMonthRows.map((row) => [row.categoryId, Number(row._sum.amount ?? 0)]),
  );
  const averageByCategory = new Map(averageRows.map((row) => [row.categoryId, row.average]));

  const categoryIds = new Set([...thisMonthByCategory.keys(), ...averageByCategory.keys()]);

  return Array.from(categoryIds).map((categoryId) => {
    const category = categoryId ? categoryById.get(categoryId) : null;
    return {
      category_id: categoryId,
      category: category?.name ?? "Uncategorized",
      thisMonth: roundCurrency(thisMonthByCategory.get(categoryId) ?? 0),
      average: roundCurrency(averageByCategory.get(categoryId) ?? 0),
    };
  });
}
