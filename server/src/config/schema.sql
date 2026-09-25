-- ExpenseMate database schema
-- Target: Supabase-hosted Postgres, accessed only via the Node/Express backend
-- using the service role key. There is no Supabase Auth, no RLS, and no
-- Edge Functions involved — all auth and business logic lives in server/.
--
-- Run this whole file once against a fresh database (Supabase SQL Editor,
-- or psql/CLI). It is written to be re-runnable: extension and indexes use
-- IF NOT EXISTS; tables use IF NOT EXISTS as a safety net, but note that
-- IF NOT EXISTS on CREATE TABLE will silently skip re-applying column
-- changes if the table already exists in an older shape.

-- ============================================================================
-- Extensions
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. users
-- ============================================================================

create table if not exists users (
  id                     uuid primary key default gen_random_uuid(),
  email                  text not null unique,
  password_hash          text,
  provider               text not null default 'local' check (provider in ('local', 'google')),
  google_id              text unique,
  full_name              text,
  avatar_url             text,
  currency               text default 'USD',
  is_email_verified      boolean default false,
  reset_password_token   text,
  reset_password_expires timestamptz,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- ============================================================================
-- 2. categories
-- ============================================================================

create table if not exists categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references users(id) on delete cascade, -- nullable: null = global default category
  name       text not null,
  icon       text,
  color      text,
  is_default boolean default false,
  created_at timestamptz default now(),
  unique (user_id, name)
);

-- ============================================================================
-- 3. cards
-- ============================================================================

create table if not exists cards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  nickname      text not null,
  card_type     text,
  last_four     text not null check (char_length(last_four) = 4),
  expiry_month  int check (expiry_month between 1 and 12),
  expiry_year   int,
  balance       numeric(12, 2) default 0,
  credit_limit  numeric(12, 2) default 0,
  credit_used   numeric(12, 2) default 0,
  currency      text default 'USD',
  color_theme   text default '#000000',
  is_default    boolean default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================================================================
-- 4. transactions
-- ============================================================================

create table if not exists transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  card_id     uuid references cards(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  type        text not null check (type in ('income', 'expense')),
  amount      numeric(12, 2) not null,
  merchant    text,
  note        text,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz default now()
);

-- ============================================================================
-- 5. budgets
-- ============================================================================

create table if not exists budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  category_id uuid references categories(id) on delete cascade,
  amount      numeric(12, 2) not null,
  period      text not null default 'monthly' check (period in ('weekly', 'monthly', 'yearly')),
  start_date  date not null,
  end_date    date,
  created_at  timestamptz default now(),
  unique (user_id, category_id, period, start_date)
);

-- ============================================================================
-- 6. budget_alerts
-- ============================================================================

create table if not exists budget_alerts (
  id                uuid primary key default gen_random_uuid(),
  budget_id         uuid not null references budgets(id) on delete cascade,
  threshold_percent int not null default 80,
  triggered_at      timestamptz,
  is_read           boolean default false,
  created_at        timestamptz default now()
);

-- ============================================================================
-- Indexes
-- ============================================================================

create index if not exists idx_transactions_user_date on transactions (user_id, occurred_at desc);
create index if not exists idx_transactions_category   on transactions (category_id);
create index if not exists idx_budgets_user             on budgets (user_id);
create index if not exists idx_cards_user                on cards (user_id);
create index if not exists idx_users_email               on users (email);
create index if not exists idx_users_google_id           on users (google_id);