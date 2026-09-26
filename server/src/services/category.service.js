import { AppError } from "../utils/app-error.js";
import * as categoryRepository from "../repositories/category.repository.js";

export async function getCategories(userId) {
  return categoryRepository.findAllForUser(userId);
}

export async function createCategory(userId, data) {
  return categoryRepository.create(userId, data);
}

async function assertEditable(userId, categoryId) {
  const category = await categoryRepository.findById(categoryId);

  if (!category) {
    throw new AppError("Category not found", 404);
  }

  if (category.isDefault || category.userId !== userId) {
    throw new AppError(
      "You don't have permission to modify this category",
      403,
    );
  }

  return category;
}

export async function updateCategory(userId, categoryId, data) {
  await assertEditable(userId, categoryId);
  return categoryRepository.update(categoryId, data);
}

export async function deleteCategory(userId, categoryId) {
  await assertEditable(userId, categoryId);
  // Per the schema's FK rules: Transaction.categoryId is onDelete: SetNull
  // (transactions survive, category_id becomes null), while Budget.categoryId
  // is onDelete: Cascade (budgets tied to this category are deleted too).
  // No extra guard logic needed — the DB handles both.
  await categoryRepository.deleteCategory(categoryId);
}
