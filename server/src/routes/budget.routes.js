import express from "express";

import * as budgetController from "../controllers/budget.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { protect } from "../middleware/auth.middleware.js";
import {
  createBudgetSchema,
  updateBudgetSchema,
  listBudgetsQuerySchema,
} from "../validators/budget.validator.js";

const router = express.Router();

router.use(protect);

router.get(
  "/",
  validate(listBudgetsQuerySchema, "query"),
  budgetController.getBudgets,
);
router.get("/:id", budgetController.getBudgetById);
router.post("/", validate(createBudgetSchema), budgetController.createBudget);
router.patch(
  "/:id",
  validate(updateBudgetSchema),
  budgetController.updateBudget,
);
router.delete("/:id", budgetController.deleteBudget);

export default router;
