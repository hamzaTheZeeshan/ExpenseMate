import express from "express";

import * as transactionController from "../controllers/transaction.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { protect } from "../middleware/auth.middleware.js";
import {
  createTransactionSchema,
  updateTransactionSchema,
  listTransactionsQuerySchema,
} from "../validators/transaction.validator.js";

const router = express.Router();

router.use(protect);

router.get(
  "/",
  validate(listTransactionsQuerySchema, "query"),
  transactionController.getTransactions,
);
router.get("/:id", transactionController.getTransactionById);
router.post(
  "/",
  validate(createTransactionSchema),
  transactionController.createTransaction,
);
router.patch(
  "/:id",
  validate(updateTransactionSchema),
  transactionController.updateTransaction,
);
router.delete("/:id", transactionController.deleteTransaction);

export default router;
