import Joi from "joi";

// At least 1 letter + 1 number, min 8 chars.
const passwordRule = Joi.string()
  .min(8)
  .pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)
  .required()
  .messages({
    "string.pattern.base":
      "Password must contain at least one letter and one number",
    "string.min": "Password must be at least 8 characters",
  });

export const signupSchema = Joi.object({
  email: Joi.string().email().required(),
  password: passwordRule,
  full_name: Joi.string().required(),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: passwordRule,
});

export const googleAuthSchema = Joi.object({
  idToken: Joi.string().required(),
});
