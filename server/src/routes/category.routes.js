import express from "express";

import * as categoryController from "../controllers/category.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { protect } from "../middleware/auth.middleware.js";
import {
  createCategorySchema,
  updateCategorySchema,
} from "../validators/category.validator.js";

const router = express.Router();

router.use(protect);

router.get("/", categoryController.getCategories);
router.post(
  "/",
  validate(createCategorySchema),
  categoryController.createCategory,
);
router.patch(
  "/:id",
  validate(updateCategorySchema),
  categoryController.updateCategory,
);
router.delete("/:id", categoryController.deleteCategory);

export default router;
