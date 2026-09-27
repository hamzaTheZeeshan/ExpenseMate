import * as transactionRepository from "../repositories/transaction.repository.js";
import * as categoryRepository from "../repositories/category.repository.js";
import prisma from "../config/db.js";
import { AppError } from "../utils/app-error.js";

/**
 * Confirms a card_id, if provided, exists and belongs to the user.
 *
 * TEMPORARY: there is no cards module yet (no card.repository.js, no
 * card.service.js). This queries prisma.card directly so transactions
 * isn't blocked on that module landing. Once card.repository.js exists
 * with a findById(id), replace this with that call, the same way
 * assertCategoryOwnership below uses categoryRepository.findById.
 */
async function assertCardOwnership(cardId, userId) {
  if (!cardId) return;
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) throw new AppError("Card not found", 404);
  if (card.userId !== userId)
    throw new AppError("Card does not belong to this user", 403);
}

/**
 * Confirms a category_id, if provided, exists and is either a default
 * category (userId: null) or belongs to the user.
 *
 * Deliberately uses categoryRepository.findById + a manual ownership
 * check here rather than categoryRepository.isOwnedByUser, because that
 * helper returns false for default categories (isDefault) by design —
 * which is correct for category-mutation endpoints, but wrong here since
 * a transaction is allowed to reference a default category.
 */
async function assertCategoryOwnership(categoryId, userId) {
  if (!categoryId) return;
  const category = await categoryRepository.findById(categoryId);
  if (!category) throw new AppError("Category not found", 404);
  const isDefault = category.userId === null;
  if (!isDefault && category.userId !== userId) {
    throw new AppError("Category does not belong to this user", 403);
  }
}

export async function getTransactions(userId, filters, pagination) {
  // Filters are read-only scoping, not writes — no ownership check needed
  // on filters.category_id / filters.card_id, the query is always scoped
  // to userId regardless of what's passed.
  return transactionRepository.findAllForUser(userId, filters, pagination);
}

export async function getTransactionById(userId, id) {
  const transaction = await transactionRepository.findById(id);
  if (!transaction) throw new AppError("Transaction not found", 404);
  if (transaction.userId !== userId)
    throw new AppError("You do not have access to this transaction", 403);
  return transaction;
}

export async function createTransaction(userId, data) {
  await assertCardOwnership(data.card_id, userId);
  await assertCategoryOwnership(data.category_id, userId);

  // NOTE / FOLLOW-UP: when a transaction references a card, this does NOT
  // adjust that card's balance/credit_used. Deliberately deferred — the
  // sync behavior (does an expense increase credit_used or decrease
  // balance, does deleting/updating a transaction reverse it, does
  // changing a transaction's card_id move the adjustment) isn't decided
  // yet, and there's no cards module to sync against regardless. This
  // pass only stores the FK link.
  return transactionRepository.create(userId, data);
}

export async function updateTransaction(userId, id, data) {
  const existing = await transactionRepository.findById(id);
  if (!existing) throw new AppError("Transaction not found", 404);
  if (existing.userId !== userId)
    throw new AppError("You do not have access to this transaction", 403);

  if (data.card_id !== undefined)
    await assertCardOwnership(data.card_id, userId);
  if (data.category_id !== undefined)
    await assertCategoryOwnership(data.category_id, userId);

  // Same follow-up as createTransaction: no card balance adjustment here,
  // even if type/amount/card_id changes.
  return transactionRepository.update(id, data);
}

export async function deleteTransaction(userId, id) {
  const existing = await transactionRepository.findById(id);
  if (!existing) throw new AppError("Transaction not found", 404);
  if (existing.userId !== userId)
    throw new AppError("You do not have access to this transaction", 403);

  await transactionRepository.deleteTransaction(id);
}
