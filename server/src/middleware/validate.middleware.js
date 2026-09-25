import { AppError } from "../utils/app-error.js";

// Usage: router.post("/signup", validate(signupSchema), authController.signup)
export const validate =
  (schema, property = "body") =>
  (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const message = error.details.map((d) => d.message).join(", ");
      return next(new AppError(message, 400));
    }

    req[property] = value;
    next();
  };
