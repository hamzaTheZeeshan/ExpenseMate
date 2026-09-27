import Joi from "joi";

const PERIODS = ["weekly", "monthly", "yearly"];

// Shared cross-field check: end_date must be strictly after start_date
// when both are present. Applied via .custom() on the whole object so it
// works the same way for create (both usually present) and update (either
// may be missing from a partial payload).
function checkEndAfterStart(value, helpers) {
  const { start_date, end_date } = value;

  if (start_date && end_date) {
    const start = new Date(start_date);
    const end = new Date(end_date);

    if (end <= start) {
      return helpers.message("end_date must be after start_date");
    }
  }

  return value;
}

export const createBudgetSchema = Joi.object({
  category_id: Joi.string().uuid().required(),
  amount: Joi.number().positive().required(),
  period: Joi.string()
    .valid(...PERIODS)
    .default("monthly"),
  start_date: Joi.date().iso().required(),
  end_date: Joi.date().iso().optional(),
}).custom(checkEndAfterStart);

export const updateBudgetSchema = Joi.object({
  category_id: Joi.string().uuid().optional(),
  amount: Joi.number().positive().optional(),
  period: Joi.string()
    .valid(...PERIODS)
    .optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().optional(),
})
  .min(1)
  .custom(checkEndAfterStart)
  .messages({
    "object.min": "At least one field must be provided to update",
  });

export const listBudgetsQuerySchema = Joi.object({
  category_id: Joi.string().uuid().optional(),
  period: Joi.string()
    .valid(...PERIODS)
    .optional(),
  active: Joi.boolean().optional(),
});
