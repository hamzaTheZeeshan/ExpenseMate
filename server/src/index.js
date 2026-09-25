import app from "./app.js";
import env from "./config/env.js";
import prisma from "./config/db.js";

let server;

async function start() {
  try {
    // Confirm the DB is actually reachable before accepting traffic.
    await prisma.$connect();
    console.log("Database connection established.");

    server = app.listen(env.port, () => {
      console.log(
        `ExpenseMate API running on port ${env.port} [${env.nodeEnv}]`,
      );
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);

  if (server) {
    server.close(async () => {
      await prisma.$disconnect();
      console.log("Server closed, DB disconnected.");
      process.exit(0);
    });
  } else {
    await prisma.$disconnect();
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start();
