import express from "express";

import * as dashboardController from "../controllers/dashboard.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

router.get("/", dashboardController.getDashboardSummary);

export default router;
