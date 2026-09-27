import express from "express";

import * as analyticsController from "../controllers/analytics.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { protect } from "../middleware/auth.middleware.js";
import {
  spendingByCategoryQuerySchema,
  spendingOverTimeQuerySchema,
  incomeVsExpenseQuerySchema,
} from "../validators/analytics.validator.js";

const router = express.Router();

router.use(protect);

router.get(
  "/spending-by-category",
  validate(spendingByCategoryQuerySchema, "query"),
  analyticsController.getSpendingByCategory,
);
router.get(
  "/spending-over-time",
  validate(spendingOverTimeQuerySchema, "query"),
  analyticsController.getSpendingOverTime,
);
router.get(
  "/income-vs-expense",
  validate(incomeVsExpenseQuerySchema, "query"),
  analyticsController.getIncomeVsExpense,
);
router.get("/spending-radar", analyticsController.getSpendingRadar);

export default router;
