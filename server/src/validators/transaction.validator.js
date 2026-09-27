import Joi from "joi";

const TXN_TYPES = ["income", "expense"];

// Public (snake_case) sort field names accepted in `sort=field:dir`.
// The repository maps these to their Prisma (camelCase) column names.
export const SORTABLE_FIELDS = ["occurred_at", "amount", "created_at"];

const sortPattern = new RegExp(`^(${SORTABLE_FIELDS.join("|")}):(asc|desc)$`);

export const createTransactionSchema = Joi.object({
  type: Joi.string()
    .valid(...TXN_TYPES)
    .required()
    .messages({ "any.only": "type must be 'income' or 'expense'" }),
  amount: Joi.number().positive().required(),
  merchant: Joi.string().max(100).optional(),
  note: Joi.string().max(500).optional(),
  card_id: Joi.string().guid({ version: "uuidv4" }).optional(),
  category_id: Joi.string().guid({ version: "uuidv4" }).optional(),
  occurred_at: Joi.date().iso().optional(),
});

export const updateTransactionSchema = Joi.object({
  type: Joi.string().valid(...TXN_TYPES),
  amount: Joi.number().positive(),
  merchant: Joi.string().max(100),
  note: Joi.string().max(500),
  card_id: Joi.string().guid({ version: "uuidv4" }),
  category_id: Joi.string().guid({ version: "uuidv4" }),
  occurred_at: Joi.date().iso(),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided to update",
  });

export const listTransactionsQuerySchema = Joi.object({
  type: Joi.string().valid(...TXN_TYPES),
  category_id: Joi.string().guid({ version: "uuidv4" }),
  card_id: Joi.string().guid({ version: "uuidv4" }),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  page: Joi.number().integer().positive().default(1),
  limit: Joi.number().integer().positive().max(100).default(20),
  sort: Joi.string().pattern(sortPattern).default("occurred_at:desc").messages({
    "string.pattern.base": `sort must be in the form field:direction (fields: ${SORTABLE_FIELDS.join(", ")}; direction: asc|desc)`,
  }),
});
