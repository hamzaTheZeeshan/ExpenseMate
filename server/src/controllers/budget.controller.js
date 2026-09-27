import { asyncHandler } from "../utils/async-handler.js";
import * as budgetService from "../services/budget.service.js";

export const getBudgets = asyncHandler(async (req, res) => {
  const budgets = await budgetService.getBudgets(req.user.id, req.query);
  res.status(200).json({
    success: true,
    message: null,
    data: { budgets },
  });
});

export const getBudgetById = asyncHandler(async (req, res) => {
  const budget = await budgetService.getBudgetById(req.user.id, req.params.id);
  res.status(200).json({
    success: true,
    message: null,
    data: { budget },
  });
});

export const createBudget = asyncHandler(async (req, res) => {
  const budget = await budgetService.createBudget(req.user.id, req.body);
  res.status(201).json({
    success: true,
    message: "Budget created successfully",
    data: { budget },
  });
});

export const updateBudget = asyncHandler(async (req, res) => {
  const budget = await budgetService.updateBudget(
    req.user.id,
    req.params.id,
    req.body,
  );
  res.status(200).json({
    success: true,
    message: "Budget updated successfully",
    data: { budget },
  });
});

export const deleteBudget = asyncHandler(async (req, res) => {
  await budgetService.deleteBudget(req.user.id, req.params.id);
  res.status(200).json({
    success: true,
    message: "Budget deleted successfully",
    data: null,
  });
});
