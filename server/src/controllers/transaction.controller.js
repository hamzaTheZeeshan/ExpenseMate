import { asyncHandler } from "../utils/async-handler.js";
import * as transactionService from "../services/transaction.service.js";

export const getTransactions = asyncHandler(async (req, res) => {
  const { page, limit, sort, ...filters } = req.query;
  const { data, total } = await transactionService.getTransactions(
    req.user.id,
    filters,
    { page, limit, sort },
  );

  res.status(200).json({
    success: true,
    message: null,
    data: {
      transactions: data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

export const getTransactionById = asyncHandler(async (req, res) => {
  const transaction = await transactionService.getTransactionById(req.user.id, req.params.id);
  res.status(200).json({
    success: true,
    message: null,
    data: { transaction },
  });
});

export const createTransaction = asyncHandler(async (req, res) => {
  const transaction = await transactionService.createTransaction(req.user.id, req.body);
  res.status(201).json({
    success: true,
    message: "Transaction created successfully",
    data: { transaction },
  });
});

export const updateTransaction = asyncHandler(async (req, res) => {
  const transaction = await transactionService.updateTransaction(
    req.user.id,
    req.params.id,
    req.body,
  );
  res.status(200).json({
    success: true,
    message: "Transaction updated successfully",
    data: { transaction },
  });
});

export const deleteTransaction = asyncHandler(async (req, res) => {
  await transactionService.deleteTransaction(req.user.id, req.params.id);
  res.status(200).json({
    success: true,
    message: "Transaction deleted successfully",
    data: null,
  });
});
