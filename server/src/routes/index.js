import express from "express";
import authRoutes from "./auth.routes.js";
import categoryRoutes from "./category.routes.js";
import cardRoutes from "./card.routes.js";
import transactionRoutes from "./transaction.routes.js";
import budgetRoutes from "./budget.routes.js";
import analyticsRoutes from "./analytics.routes.js";
import dashboardRoutes from "./dashboard.routes.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ message: "ExpenseMate API v1" });
});

router.use("/auth", authRoutes);
router.use("/categories", categoryRoutes);
router.use("/cards", cardRoutes);
router.use("/transactions", transactionRoutes);
router.use("/budgets", budgetRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/dashboard", dashboardRoutes);

export default router;