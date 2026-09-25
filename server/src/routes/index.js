import express from "express";
import authRoutes from "./auth.routes.js";

const router = express.Router();

router.use("/auth", authRoutes);

// Other feature routers (categories, transactions, budgets, etc.) get added
// here the same way as they're built out.

router.get("/", (req, res) => {
  res.json({ message: "ExpenseMate API v1" });
});

export default router;
