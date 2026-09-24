#!/usr/bin/env node
/**
 * ExpenseMate — server scaffold (JavaScript / CommonJS)
 *
 * Usage (from the folder that should CONTAIN "server/"):
 *     node setup-server.js
 *
 * - Works on Windows, macOS, Linux (uses Node only, no shell tricks).
 * - Safe to re-run: existing files are NEVER overwritten.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(process.cwd(), "server");

// ---------------------------------------------------------------
// Files to create. Empty string = empty file, ready for you to fill.
// ---------------------------------------------------------------
const files = {
  // root
  "package.json": JSON.stringify(
    {
      name: "expensemate-server",
      version: "0.1.0",
      private: true,
      main: "src/index.js",
      scripts: {
        dev: "nodemon src/index.js",
        start: "node src/index.js",
        test: "vitest run",
      },
      dependencies: {
        bcrypt: "^5.1.1",
        cors: "^2.8.5",
        "csv-parse": "^5.5.6",
        "csv-stringify": "^6.5.1",
        dotenv: "^16.4.5",
        express: "^4.19.2",
        helmet: "^7.1.0",
        jsonwebtoken: "^9.0.2",
        multer: "^2.0.2",
        pg: "^8.12.0",
        zod: "^3.23.8",
      },
      devDependencies: {
        nodemon: "^3.1.4",
        supertest: "^7.0.0",
        vitest: "^2.0.0",
      },
    },
    null,
    2
  ) + "\n",

  ".env": [
    "PORT=5000",
    "NODE_ENV=development",
    "CLIENT_URL=http://localhost:5173",
    "DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres",
    "JWT_SECRET=change-me-to-a-long-random-string",
    "JWT_EXPIRES_IN=7d",
    "BCRYPT_SALT_ROUNDS=12",
    "",
  ].join("\n"),

  ".gitignore": "node_modules/\n.env\n*.log\ncoverage/\n",

  // starter code (the only 3 files with real content)
  "src/index.js": `const app = require("./app");
const env = require("./config/env");

app.listen(env.port, () => {
  console.log(\`ExpenseMate API running on port \${env.port}\`);
});
`,

  "src/app.js": `const express = require("express");
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
`,

  "src/config/env.js": `require("dotenv").config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(\`Missing required environment variable: \${name}\`);
  return value;
}

module.exports = {
  port: Number(process.env.PORT ?? 5000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS ?? 12),
};
`,

  "src/config/db.js": "",
};

// ---------------------------------------------------------------
// Empty files, generated from a compact description
// ---------------------------------------------------------------
const groups = {
  "src/routes": ["index", "auth", "transaction", "category", "budget", "dashboard", "analytics", "csv"]
    .map((n) => (n === "index" ? "index.js" : `${n}.routes.js`)),
  "src/controllers": ["auth", "transaction", "category", "budget", "dashboard", "analytics", "csv"]
    .map((n) => `${n}.controller.js`),
  "src/services": ["auth", "transaction", "category", "budget", "budget-alert", "dashboard", "analytics", "csv-import", "csv-export"]
    .map((n) => `${n}.service.js`),
  "src/repositories": ["user", "transaction", "category", "budget", "analytics"]
    .map((n) => `${n}.repository.js`),
  "src/middleware": ["auth", "validate", "upload", "rate-limit", "not-found", "error"]
    .map((n) => `${n}.middleware.js`),
  "src/validators": ["auth", "transaction", "category", "budget", "csv"]
    .map((n) => `${n}.validator.js`),
  "src/utils": ["app-error.js", "async-handler.js", "jwt.js", "password.js", "date.js"],
};

for (const [dir, names] of Object.entries(groups)) {
  for (const name of names) files[`${dir}/${name}`] = "";
}

// test folders need to exist even though they hold no files yet
const extraDirs = ["tests/unit", "tests/integration"];

// ---------------------------------------------------------------
// Create everything
// ---------------------------------------------------------------
let created = 0;
let skipped = 0;

for (const dir of extraDirs) fs.mkdirSync(path.join(ROOT, dir), { recursive: true });

for (const [rel, content] of Object.entries(files)) {
  const full = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  if (fs.existsSync(full)) {
    skipped++;
    console.log(`  skip    ${rel}  (already exists)`);
    continue;
  }
  fs.writeFileSync(full, content);
  created++;
  console.log(`  create  ${rel}`);
}

// git ignores empty folders, so keep the test folders tracked
for (const dir of extraDirs) {
  const keep = path.join(ROOT, dir, ".gitkeep");
  if (!fs.existsSync(keep)) fs.writeFileSync(keep, "");
}

console.log(`\nDone. ${created} created, ${skipped} skipped.`);
console.log("\nNext steps:");
console.log("  cd server");
console.log("  npm install");
console.log("  (edit .env with your real DATABASE_URL and a strong JWT_SECRET)");
console.log("  npm run dev");