import * as transactionRepository from "../repositories/transaction.repository.js";
import * as cardRepository from "../repositories/card.repository.js";
import * as budgetService from "./budget.service.js";
import * as analyticsService from "./analytics.service.js";

const RECENT_TRANSACTIONS_LIMIT = 5;

export async function getDashboardSummary(userId) {
  const [recentTransactionsResult, cards, activeBudgets, monthSummary] = await Promise.all([
    transactionRepository.findAllForUser(
      userId,
      {},
      { page: 1, limit: RECENT_TRANSACTIONS_LIMIT, sort: "occurred_at:desc" },
    ),
    cardRepository.findAllForUser(userId),
    budgetService.getBudgets(userId, { active: true }),
    analyticsService.getIncomeVsExpense(userId, {}),
  ]);

  const totalBalance = cards.reduce((sum, card) => sum + Number(card.balance ?? 0), 0);

  return {
    recent_transactions: recentTransactionsResult.data,
    cards,
    active_budgets: activeBudgets,
    total_balance: Math.round(totalBalance * 100) / 100,
    month_summary: monthSummary,
  };
}
