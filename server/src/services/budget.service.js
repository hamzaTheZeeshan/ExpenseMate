import { AppError } from "../utils/app-error.js";
import { computePeriodEnd } from "../utils/date.js";
import * as budgetRepository from "../repositories/budget.repository.js";
import * as categoryRepository from "../repositories/category.repository.js";
import * as transactionRepository from "../repositories/transaction.repository.js";

// Prisma throws P2002 for unique constraint violations. Recognized here so
// the (user_id, category_id, period, start_date) collision from the schema
// maps to a clean 409 instead of leaking a raw Prisma error to the client.
const PRISMA_UNIQUE_CONSTRAINT_CODE = "P2002";

async function assertCategoryAccessible(userId, categoryId) {
  const category = await categoryRepository.findById(categoryId);

  if (!category) {
    throw new AppError("Category not found", 404);
  }

  // A category is usable for a budget if it's this user's own category, or
  // a default (userId === null) category available to everyone.
  const accessible = category.userId === null || category.userId === userId;
  if (!accessible) {
    throw new AppError("You don't have permission to use this category", 403);
  }

  return category;
}

async function assertOwnedOrThrow(userId, budgetId) {
  const budget = await budgetRepository.findById(budgetId);

  if (!budget) {
    throw new AppError("Budget not found", 404);
  }

  if (budget.userId !== userId) {
    throw new AppError("You don't have permission to access this budget", 403);
  }

  return budget;
}

// Attaches spent / remaining / percent_used to a budget by summing expense
// transactions for its category within [start_date, end_date-or-implied].
async function withProgress(budget) {
  const startDate = budget.startDate;
  const endDate = budget.endDate ?? computePeriodEnd(startDate, budget.period);

  const spent = await transactionRepository.sumExpensesForCategoryInRange(
    budget.userId,
    budget.categoryId,
    startDate,
    endDate,
  );

  const amount = Number(budget.amount);
  const remaining = amount - spent;
  const percentUsed = amount > 0 ? Math.round((spent / amount) * 100) : 0;

  return {
    ...budget,
    spent,
    remaining,
    percent_used: percentUsed,
  };
}

export async function getBudgets(userId, filters) {
  const budgets = await budgetRepository.findAllForUser(userId, filters);
  return Promise.all(budgets.map(withProgress));
}

export async function getBudgetById(userId, budgetId) {
  const budget = await assertOwnedOrThrow(userId, budgetId);
  return withProgress(budget);
}

export async function createBudget(userId, data) {
  await assertCategoryAccessible(userId, data.category_id);

  try {
    return await budgetRepository.create(userId, data);
  } catch (err) {
    if (err.code === PRISMA_UNIQUE_CONSTRAINT_CODE) {
      throw new AppError(
        "A budget for this category and period already exists starting on this date",
        409,
      );
    }
    throw err;
  }
}

export async function updateBudget(userId, budgetId, data) {
  await assertOwnedOrThrow(userId, budgetId);

  if (data.category_id !== undefined) {
    await assertCategoryAccessible(userId, data.category_id);
  }

  try {
    return await budgetRepository.update(budgetId, data);
  } catch (err) {
    if (err.code === PRISMA_UNIQUE_CONSTRAINT_CODE) {
      throw new AppError(
        "A budget for this category and period already exists starting on this date",
        409,
      );
    }
    throw err;
  }
}

export async function deleteBudget(userId, budgetId) {
  await assertOwnedOrThrow(userId, budgetId);
  // budget_alerts rows cascade-delete per schema (BudgetAlert.budget is
  // onDelete: Cascade) — no extra guard logic needed.
  await budgetRepository.deleteBudget(budgetId);
}
