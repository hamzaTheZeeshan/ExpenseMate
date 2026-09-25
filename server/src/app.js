import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import env from "./config/env.js";
import routes from "./routes/index.js";
import { apiLimiter } from "./middleware/rate-limit.middleware.js";
import notFound from "./middleware/not-found.middleware.js";
import errorHandler from "./middleware/error.middleware.js";

const app = express();

// --- Core middleware ---
app.use(helmet());
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (env.nodeEnv === "development") {
  app.use(morgan("dev"));
}

// --- Rate limiting (applied globally; routes can layer stricter limits) ---
app.use(apiLimiter);

// --- Routes ---
app.use("/api/v1", routes);

// --- 404 + error handling (must be last, in this order) ---
app.use(notFound);
app.use(errorHandler);

export default app;
