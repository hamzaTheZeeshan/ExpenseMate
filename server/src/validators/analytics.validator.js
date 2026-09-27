import Joi from "joi";

const GRANULARITIES = ["day", "week", "month"];

const dateRangeFields = {
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
};

export const spendingByCategoryQuerySchema = Joi.object({ ...dateRangeFields });

export const incomeVsExpenseQuerySchema = Joi.object({ ...dateRangeFields });

export const spendingOverTimeQuerySchema = Joi.object({
  ...dateRangeFields,
  granularity: Joi.string()
    .valid(...GRANULARITIES)
    .default("day"),
});
