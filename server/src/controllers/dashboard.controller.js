import { asyncHandler } from "../utils/async-handler.js";
import * as dashboardService from "../services/dashboard.service.js";

export const getDashboardSummary = asyncHandler(async (req, res) => {
  const summary = await dashboardService.getDashboardSummary(req.user.id);

  res.status(200).json({
    success: true,
    message: null,
    data: summary,
  });
});
