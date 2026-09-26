import { asyncHandler } from "../utils/async-handler.js";
import * as categoryService from "../services/category.service.js";

export const getCategories = asyncHandler(async (req, res) => {
  const categories = await categoryService.getCategories(req.user.id);
  res.status(200).json({
    success: true,
    message: null,
    data: { categories },
  });
});

export const createCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory(req.user.id, req.body);
  res.status(201).json({
    success: true,
    message: "Category created successfully",
    data: { category },
  });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.updateCategory(
    req.user.id,
    req.params.id,
    req.body,
  );
  res.status(200).json({
    success: true,
    message: "Category updated successfully",
    data: { category },
  });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  await categoryService.deleteCategory(req.user.id, req.params.id);
  res.status(200).json({
    success: true,
    message: "Category deleted successfully",
    data: null,
  });
});
