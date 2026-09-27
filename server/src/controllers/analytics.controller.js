import { asyncHandler } from "../utils/async-handler.js";
import * as analyticsService from "../services/analytics.service.js";

export const getSpendingByCategory = asyncHandler(async (req, res) => {
  const { start_date: startDate, end_date: endDate } = req.query;
  const data = await analyticsService.getSpendingByCategory(req.user.id, { startDate, endDate });

  res.status(200).json({
    success: true,
    message: null,
    data: { spending_by_category: data },
  });
});

export const getSpendingOverTime = asyncHandler(async (req, res) => {
  const { start_date: startDate, end_date: endDate, granularity } = req.query;
  const data = await analyticsService.getSpendingOverTime(req.user.id, {
    startDate,
    endDate,
    granularity,
  });

  res.status(200).json({
    success: true,
    message: null,
    data: { spending_over_time: data },
  });
});

export const getIncomeVsExpense = asyncHandler(async (req, res) => {
  const { start_date: startDate, end_date: endDate } = req.query;
  const data = await analyticsService.getIncomeVsExpense(req.user.id, { startDate, endDate });

  res.status(200).json({
    success: true,
    message: null,
    data,
  });
});

export const getSpendingRadar = asyncHandler(async (req, res) => {
  const data = await analyticsService.getSpendingRadar(req.user.id);

  res.status(200).json({
    success: true,
    message: null,
    data: { radar: data },
  });
});
