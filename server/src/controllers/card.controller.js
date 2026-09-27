import { asyncHandler } from "../utils/async-handler.js";
import * as cardService from "../services/card.service.js";

export const getCards = asyncHandler(async (req, res) => {
  const cards = await cardService.getCards(req.user.id);
  res.status(200).json({
    success: true,
    message: null,
    data: { cards },
  });
});

export const getCardById = asyncHandler(async (req, res) => {
  const card = await cardService.getCardById(req.user.id, req.params.id);
  res.status(200).json({
    success: true,
    message: null,
    data: { card },
  });
});

export const createCard = asyncHandler(async (req, res) => {
  const card = await cardService.createCard(req.user.id, req.body);
  res.status(201).json({
    success: true,
    message: "Card created successfully",
    data: { card },
  });
});

export const updateCard = asyncHandler(async (req, res) => {
  const card = await cardService.updateCard(
    req.user.id,
    req.params.id,
    req.body,
  );
  res.status(200).json({
    success: true,
    message: "Card updated successfully",
    data: { card },
  });
});

export const deleteCard = asyncHandler(async (req, res) => {
  await cardService.deleteCard(req.user.id, req.params.id);
  res.status(200).json({
    success: true,
    message: "Card deleted successfully",
    data: null,
  });
});
