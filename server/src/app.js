const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const env = require("./config/env");

const app = express();

app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

module.exports = app;
