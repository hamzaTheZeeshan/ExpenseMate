-- CreateEnum
CREATE TYPE "provider" AS ENUM ('local', 'google');

-- CreateEnum
CREATE TYPE "txn_type" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "budget_period" AS ENUM ('weekly', 'monthly', 'yearly');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'local',
    "google_id" TEXT,
    "full_name" TEXT,
    "avatar_url" TEXT,
    "currency" TEXT DEFAULT 'USD',
    "is_email_verified" BOOLEAN DEFAULT false,
    "reset_password_token" TEXT,
    "reset_password_expires" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "is_default" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "nickname" TEXT NOT NULL,
    "card_type" TEXT,
    "last_four" TEXT NOT NULL,
    "expiry_month" INTEGER,
    "expiry_year" INTEGER,
    "balance" DECIMAL(12,2) DEFAULT 0,
    "credit_limit" DECIMAL(12,2) DEFAULT 0,
    "credit_used" DECIMAL(12,2) DEFAULT 0,
    "currency" TEXT DEFAULT 'USD',
    "color_theme" TEXT DEFAULT '#000000',
    "is_default" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "card_id" UUID,
    "category_id" UUID,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "merchant" TEXT,
    "note" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "category_id" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'monthly',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "budget_id" UUID NOT NULL,
    "threshold_percent" INTEGER NOT NULL DEFAULT 80,
    "triggered_at" TIMESTAMPTZ,
    "is_read" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_google_id" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_name_key" ON "categories"("user_id", "name");

-- CreateIndex
CREATE INDEX "idx_cards_user" ON "cards"("user_id");

-- CreateIndex
CREATE INDEX "idx_transactions_user_date" ON "transactions"("user_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "idx_transactions_category" ON "transactions"("category_id");

-- CreateIndex
CREATE INDEX "idx_budgets_user" ON "budgets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_user_id_category_id_period_start_date_key" ON "budgets"("user_id", "category_id", "period", "start_date");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
