import Joi from "joi";

const hexColorRule = Joi.string()
  .pattern(/^#[0-9A-Fa-f]{6}$/)
  .messages({
    "string.pattern.base": "Color must be a hex value like #A1B2C3",
  });

export const createCategorySchema = Joi.object({
  name: Joi.string().max(50).required(),
  icon: Joi.string().optional(),
  color: hexColorRule.optional(),
});

export const updateCategorySchema = Joi.object({
  name: Joi.string().max(50).optional(),
  icon: Joi.string().optional(),
  color: hexColorRule.optional(),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided to update",
  });
