import express from "express";

import * as cardController from "../controllers/card.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

router.get("/", cardController.getCards);
router.get("/:id", cardController.getCardById);
router.post("/", cardController.createCard);
router.patch("/:id", cardController.updateCard);
router.delete("/:id", cardController.deleteCard);

export default router;
