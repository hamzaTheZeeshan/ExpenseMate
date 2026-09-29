import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
// NOTE: adjust this path to wherever your Assets.ts actually lives relative to this file.
import { promo } from "../Auth/Assets";

/* ──────────────────────────────────────────────────────────────────────
   CONFIG
   ────────────────────────────────────────────────────────────────────── */
const API_BASE_URL = "http://localhost:5000/api/v1"; // matches SignIn.tsx / SignUp.tsx

// How much history to pull for the budget/spend-over-time line chart.
const BUDGET_TIMELINE_DAYS_BACK = 56; // ~8 weeks
const BUDGET_TIMELINE_GRANULARITY = "week";

/* ──────────────────────────────────────────────────────────────────────
   API LAYER
   Self-contained fetch calls, same pattern as SignIn.tsx/SignUp.tsx
   (no shared client module exists yet in this codebase).
   ────────────────────────────────────────────────────────────────────── */

function authHeaders(): HeadersInit {
  const token = sessionStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    credentials: "include",
    headers: { ...authHeaders() },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok || !body.success) {
    throw new Error(body.message ?? `Request to ${path} failed.`);
  }

  return body.data as T;
}

async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok || !body.success) {
    throw new Error(body.message ?? `Request to ${path} failed.`);
  }

  return body.data as T;
}

/* Raw shapes as the backend actually returns them today.
   NOTE: dashboard.service.js hands back recent_transactions/cards as raw
   Prisma rows (camelCase, Decimal fields serialize as strings) because it
   calls the repositories directly rather than through any mapping layer —
   these interfaces reflect that, not the snake_case convention the rest
   of the API follows. */
interface RawTransaction {
  id: string;
  type: "income" | "expense";
  amount: string | number;
  merchant: string | null;
  note: string | null;
  occurredAt: string;
  cardId: string | null;
}

// Shape of POST /transactions's response: { transaction: RawTransaction & { card: RawCard } }.
// The backend returns the transaction's own card inline, already updated —
// used instead of guessing at a client-side balance delta.
interface CreateTransactionResponse {
  transaction: RawTransaction & { card: RawCard | null };
}

interface RawCard {
  id: string;
  nickname: string;
  lastFour: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  balance: string | number | null;
  creditLimit: string | number | null;
  creditUsed: string | number | null;
  currency: string | null;
  isDefault: boolean | null;
}

interface DashboardResponse {
  recent_transactions: RawTransaction[];
  cards: RawCard[];
  active_budgets: unknown[];
  total_balance: number;
  month_summary: { income: number; expense: number; net: number };
}

// UNVERIFIED — GET /auth/me's real shape wasn't available while building
// this. Assumed snake_case (full_name) per the rest of the API, with a
// couple of fallbacks so this doesn't hard-fail if it's shaped differently.
interface MeResponse {
  full_name?: string;
  name?: string;
  email?: string;
  user?: { full_name?: string; name?: string; email?: string };
}

interface SpendingOverTimeRow {
  period: string;
  amount: number;
}

/* ──────────────────────────────────────────────────────────────────────
   MAPPING HELPERS (raw API shapes → the component prop shapes below)
   ────────────────────────────────────────────────────────────────────── */

function formatTxDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleString("en-US", { month: "long" });
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${day} ${month} · ${hours}:${minutes} ${ampm}`;
}

function formatPeriodLabel(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleString("en-US", { month: "short" }).toLowerCase();
  return `${day} ${month}`;
}

function formatExpiry(month: number | null, year: number | null): string {
  if (!month || !year) return "--/--";
  return `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;
}

function deriveBadge(merchant: string | null): Transaction["badge"] {
  const m = (merchant ?? "").toLowerCase();
  if (m.includes("paypal")) return "paypal";
  if (m.includes("twitch")) return "twitch";
  if (m.includes("airbnb")) return "airbnb";
  if (m.includes("dribbble")) return "dribbble";
  return "other";
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function toNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/* ──────────────────────────────────────────────────────────────────────
   COMPONENT PROP SHAPES
   (CardSummary and QuickContact's old "plan"/contacts fields are gone —
   the peek visual and Quick Transfer card were dropped, see decisions.)
   ────────────────────────────────────────────────────────────────────── */

interface Transaction {
  id: string;
  merchant: string;
  date: string;
  amount: number; // negative = money out
  badge: "paypal" | "twitch" | "airbnb" | "dribbble" | "other";
  cardId: string | null;
}

interface CardSummary {
  id: string;
  holderCardName: string;
  balance: number;
  last4: string;
  expiry: string;
  network: string; // no schema field for this — hardcoded "CARD", see decisions
  creditLimit: number;
  creditUsed: number;
  currency: string;
}

interface BudgetPoint {
  label: string;
  value: number;
}

interface DashboardData {
  cards: CardSummary[]; // stable order (default first); the stack order lives in Dashboard state
  budget: BudgetPoint[];
  user: { name: string; initials: string; email: string };
}

function mapCard(rawPrimary: RawCard | null | undefined): CardSummary | null {
  if (!rawPrimary) return null;
  return {
    id: rawPrimary.id,
    holderCardName: rawPrimary.nickname,
    balance: toNumber(rawPrimary.balance),
    last4: rawPrimary.lastFour,
    expiry: formatExpiry(rawPrimary.expiryMonth, rawPrimary.expiryYear),
    network: "CARD", // no network field on the Card model — hardcoded per decision
    creditLimit: toNumber(rawPrimary.creditLimit),
    creditUsed: toNumber(rawPrimary.creditUsed),
    currency: rawPrimary.currency ?? "USD",
  };
}

function mapTransaction(tx: RawTransaction): Transaction {
  const amount = toNumber(tx.amount);
  return {
    id: tx.id,
    merchant: tx.merchant ?? "Transaction",
    date: formatTxDate(tx.occurredAt),
    amount: tx.type === "expense" ? -Math.abs(amount) : Math.abs(amount),
    badge: deriveBadge(tx.merchant),
    cardId: tx.cardId,
  };
}

async function loadDashboardData(): Promise<DashboardData> {
  const rangeEnd = new Date();
  const rangeStart = new Date(rangeEnd);
  rangeStart.setDate(rangeStart.getDate() - BUDGET_TIMELINE_DAYS_BACK);
  const timelineParams = new URLSearchParams({
    start_date: rangeStart.toISOString(),
    end_date: rangeEnd.toISOString(),
    granularity: BUDGET_TIMELINE_GRANULARITY,
  });

  const [dashboard, me, overTime] = await Promise.all([
    apiGet<DashboardResponse>("/dashboard"),
    apiGet<MeResponse>("/auth/me"),
    apiGet<{ spending_over_time: SpendingOverTimeRow[] }>(
      `/analytics/spending-over-time?${timelineParams.toString()}`,
    ),
  ]);

  // ── cards: every card the user owns, default first (already ordered
  // isDefault desc by card.repository.findAllForUser). Recent transactions
  // are no longer taken from this payload — they're fetched per card, see
  // Dashboard() below, so every card in the stack gets a real list. ──
  const cards: CardSummary[] = dashboard.cards
    .map((c) => mapCard(c))
    .filter((c): c is CardSummary => c !== null);

  // ── budget/spend-over-time line chart ──
  const budget: BudgetPoint[] = overTime.spending_over_time.map((row) => ({
    label: formatPeriodLabel(row.period),
    value: row.amount,
  }));

  // ── user (GET /auth/me shape unverified, see note above).
  // Try every plausible key. If none match, fall back to the local part
  // of the email (or "Account") instead of the placeholder "there" —
  // still wrong if the shape differs, but a much less confusing wrong.
  const email = me.email ?? me.user?.email ?? "";
  const fullName =
    me.full_name ??
    me.name ??
    me.user?.full_name ??
    me.user?.name ??
    (email ? email.split("@")[0] : "Account");
  const user = { name: fullName, initials: initialsFromName(fullName), email };

  return { cards, budget, user };
}

/* ──────────────────────────────────────────────────────────────────────
   STYLES
   ────────────────────────────────────────────────────────────────────── */
const styles = `
@import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");

.db-page {
  --lime: #c6ee4a;
  --lime-deep: #8fbf1f;
  --ink: #0a0a0a;
  --muted: #6b716a;
  --line: #e4e7dc;
  --panel: #ffffff;
  --bg: #eef2e4;
  --danger: #c0392b;

  min-height: 100vh;
  display: flex;
  gap: 16px;
  padding: 16px;
  background: var(--bg);
  font-family: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--ink);
  box-sizing: border-box;
  position: relative;
}
.db-page *, .db-page *::before, .db-page *::after { box-sizing: border-box; }

/* ── main ── */
.db-main { flex: 1; min-width: 0; }

.db-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 20px;
}
.db-title { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin: 0; }
.db-header__right { display: flex; align-items: center; gap: 12px; }
.db-pill-select {
  display: flex; align-items: center; gap: 6px;
  height: 40px; padding: 0 16px;
  border-radius: 999px; border: 1px solid var(--line);
  background: #fff; font-size: 14px; font-weight: 500;
  cursor: pointer; color: var(--ink);
}
.db-icon-btn {
  width: 40px; height: 40px; border-radius: 999px;
  border: 1px solid var(--line); background: #fff;
  display: grid; place-items: center; cursor: pointer; color: var(--ink);
  position: relative;
}
.db-icon-btn:focus-visible, .db-pill-select:focus-visible { outline: 2px solid var(--lime-deep); outline-offset: 2px; }
.db-dot { position: absolute; top: 9px; right: 10px; width: 6px; height: 6px; border-radius: 50%; background: var(--danger); }
.db-user {
  display: flex; align-items: center; gap: 10px; margin-left: 4px;
  border: 0; background: transparent; cursor: pointer; padding: 4px 6px 4px 4px;
  border-radius: 999px; font: inherit; color: var(--ink);
  position: relative;
}
.db-user:hover { background: #fff; }
.db-user:focus-visible { outline: 2px solid var(--lime-deep); outline-offset: 2px; }
.db-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  background: var(--ink); color: #fff;
  display: grid; place-items: center; font-size: 13px; font-weight: 600;
  flex-shrink: 0;
}
.db-user__name { font-size: 14px; font-weight: 600; }

/* ── account dropdown ── */
.db-account-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 220px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: 0 12px 32px rgba(10,10,10,0.12);
  padding: 8px;
  z-index: 40;
  text-align: left;
}
.db-account-menu__head { padding: 10px 10px 12px; border-bottom: 1px solid var(--line); margin-bottom: 6px; }
.db-account-menu__name { font-size: 14px; font-weight: 700; margin: 0; }
.db-account-menu__email { font-size: 12.5px; color: var(--muted); margin: 2px 0 0; word-break: break-all; }
.db-account-menu__item {
  display: flex; align-items: center; gap: 10px; width: 100%;
  border: 0; background: transparent; text-align: left; cursor: pointer;
  padding: 9px 10px; border-radius: 10px; font: inherit; font-size: 13.5px;
  font-weight: 500; color: var(--ink);
}
.db-account-menu__item:hover { background: var(--bg); }
.db-account-menu__item.danger { color: var(--danger); }

/* ── grid: explicit column groups so Promo can span both rows ── */
.db-grid {
  display: grid;
  grid-template-columns: 1.15fr 1.25fr 0.82fr;
  grid-template-rows: auto auto;
  gap: 16px;
  align-items: start;
}
.db-grid__col1 { display: flex; flex-direction: column; gap: 16px; }
.db-grid__col2 { display: flex; flex-direction: column; gap: 16px; }
.db-grid__promo { grid-row: 1 / span 2; align-self: start; }

.db-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 24px;
  overflow: hidden;
  transition: height 0.45s cubic-bezier(0.32, 0.08, 0.24, 1);
}
.db-card__inner { padding: 22px; }
/* new rows ease in instead of popping */
@keyframes db-row-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
.db-tx-list .db-tx { animation: db-row-in 0.4s ease both; }
.db-card__head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
.db-card__title { font-size: 16px; font-weight: 700; margin: 0; }
.db-card__subtitle { font-size: 12px; color: var(--muted); margin: 3px 0 0; }

.db-view-all {
  display: inline-flex; align-items: center; gap: 4px;
  height: 30px; padding: 0 12px;
  border-radius: 999px; border: 0; background: var(--ink); color: #fff;
  font-size: 12px; font-weight: 600; cursor: pointer;
}

/* ── transactions ── */
.db-tx-list { display: flex; flex-direction: column; gap: 14px; }
.db-tx { display: flex; align-items: center; gap: 12px; }
.db-tx__badge { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font-size: 13px; font-weight: 700; color: #fff; flex-shrink: 0; }
.db-tx__info { flex: 1; min-width: 0; }
.db-tx__name { font-size: 14px; font-weight: 600; margin: 0; }
.db-tx__date { font-size: 12.5px; color: var(--muted); margin: 2px 0 0; }
.db-tx__amount { font-size: 14px; font-weight: 600; white-space: nowrap; }
.db-empty-note { font-size: 13.5px; color: var(--muted); padding: 8px 0; }

/* ── spending / legend ── */

/* ── income / expenses / savings donut ── */
.db-pie-wrap { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.db-pie { width: 100%; max-width: 230px; height: auto; display: block; overflow: visible; }
.db-pie__label { font-size: 10.5px; font-weight: 700; fill: var(--muted); font-family: inherit; text-transform: uppercase; letter-spacing: 0.08em; }
.db-pie__value { font-size: 24px; font-weight: 800; fill: var(--ink); font-family: inherit; letter-spacing: -0.02em; }
.db-pie__sub { font-size: 11px; fill: var(--muted); font-family: inherit; }
.db-pie__insight { font-size: 13px; line-height: 1.5; color: var(--muted); text-align: center; margin: 0; }
.db-pie__insight strong { color: var(--ink); font-weight: 700; }
.db-pie-legend { list-style: none; margin: 0; padding: 0; width: 100%; display: flex; flex-direction: column; gap: 8px; }
.db-pie-legend__row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border-radius: 14px;
  background: #fbfcf8; border: 1px solid var(--line);
  transition: background 0.2s ease, border-color 0.2s ease;
}
.db-pie-legend__row--hoverable { cursor: default; }
.db-pie-legend__row.is-active { background: #fff; border-color: var(--ink); }
.db-pie-legend__dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.db-pie-legend__text { flex: 1; min-width: 0; }
.db-pie-legend__name { font-size: 13.5px; font-weight: 700; margin: 0; }
.db-pie-legend__hint { font-size: 12px; color: var(--muted); margin: 2px 0 0; }
.db-pie-legend__amount { font-size: 14px; font-weight: 700; white-space: nowrap; }
.db-toggle-row--sm { width: auto; }
.db-toggle-row--sm .db-toggle-btn { height: 34px; padding: 0 12px; font-size: 13px; border-radius: 10px; }
.db-pie-note { font-size: 11.5px; color: var(--muted); text-align: center; margin: 10px 0 0; }

/* ── credit card widget ── */
/* stacked cards: every card is absolutely positioned; --pos (0 = front)
   drives its offset/scale, so switching cards is just a transition. */
.db-card-stack { position: relative; margin-bottom: 18px; }
.db-stack { position: relative; transition: height 0.45s cubic-bezier(0.32, 0.08, 0.24, 1); }
.db-stack--clickable { cursor: pointer; }
.db-stack:focus-visible { outline: 2px solid var(--lime-deep); outline-offset: 6px; border-radius: 20px; }
.db-visual-card {
  position: absolute; top: 0; left: 0; right: 0;
  height: 150px;
  padding: 18px 20px 16px;
  border-radius: 20px;
  background: var(--lime);
  color: var(--ink);
  transform-origin: top center;
  transform: translateY(calc(var(--pos, 0) * 18px)) scale(calc(1 - var(--pos, 0) * 0.04));
  transition: transform 0.5s cubic-bezier(0.32, 0.08, 0.24, 1), opacity 0.3s ease, box-shadow 0.3s ease;
  box-shadow: 0 8px 20px rgba(10,10,10,0.10);
  user-select: none;
}
.db-visual-card.is-hidden { opacity: 0; pointer-events: none; }
/* phase 1 of the swap: the front card lifts and tilts out before dropping behind */
.db-visual-card.is-leaving {
  transform: translate(16px, -12px) rotate(4deg);
  transition-duration: 0.26s;
  box-shadow: 0 16px 32px rgba(10,10,10,0.18);
}
.db-visual-card--v1 { background: var(--ink); color: #fff; }
.db-visual-card--v2 { background: #cfd9bd; }
.db-visual-card--v3 { background: #4d5c3a; color: #fff; }
.db-visual-card__chip { position: absolute; top: 16px; right: 20px; opacity: 0.55; }
.db-visual-card__name { font-size: 15px; font-weight: 700; margin: 0 0 14px; }
.db-visual-card__balance { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
.db-visual-card__balance small { font-size: 15px; font-weight: 700; }
.db-visual-card__foot { position: absolute; left: 20px; right: 20px; bottom: 16px; display: flex; align-items: flex-end; justify-content: space-between; font-size: 13px; font-weight: 600; letter-spacing: 0.03em; }
.db-stack-hint { font-size: 12px; color: var(--muted); text-align: center; margin: 14px 0 0; }

.db-card-meta { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.db-card-meta__row { display: flex; align-items: center; justify-content: space-between; font-size: 13.5px; }
.db-card-meta__label { color: var(--muted); }
.db-card-meta__value { font-weight: 600; }

.db-add-card-btn {
  width: 100%; height: 46px; border-radius: 999px; border: 0;
  background: var(--ink); color: #fff; font: inherit; font-size: 14px; font-weight: 600;
  cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
}
.db-add-card-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.db-toggle-row { display: flex; gap: 8px; }
.db-toggle-btn {
  flex: 1; height: 40px; border-radius: 12px; border: 1px solid var(--line);
  background: #fbfcf8; font: inherit; font-size: 13.5px; font-weight: 600;
  color: var(--muted); cursor: pointer;
}
.db-toggle-btn.active { background: var(--ink); border-color: var(--ink); color: #fff; }

/* ── budget chart ── */
.db-budget-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.db-tooltip-bubble { fill: var(--ink); }
.db-tooltip-text { fill: #fff; font-size: 12px; font-weight: 700; font-family: inherit; }
.db-axis-label { font-size: 11px; fill: var(--muted); font-family: inherit; }

/* ── promo card: image-based ad that flips to reveal the plan on its back ── */
.db-promo {
  perspective: 1200px;
  border-radius: 24px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.db-promo:focus-visible { outline: 2px solid var(--lime-deep); outline-offset: 4px; }
.db-promo__inner {
  display: grid; /* both faces share one cell, so the card is as tall as the taller face */
  transform-style: preserve-3d;
  transition: transform 0.7s cubic-bezier(0.4, 0.2, 0.2, 1);
}
.db-promo.is-flipped .db-promo__inner { transform: rotateY(180deg); }
.db-promo__face {
  grid-area: 1 / 1;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  border-radius: 24px;
  overflow: hidden;
  background: #c9f44f; /* sampled from the ad image so any leftover space blends in */
}
.db-promo__face--front { line-height: 0; }
.db-promo__img { width: 100%; height: auto; display: block; }
.db-promo__face--back {
  transform: rotateY(180deg);
  padding: 26px 22px 20px;
  display: flex; flex-direction: column;
}
.db-promo__back-title { font-size: 24px; font-weight: 800; line-height: 1.15; letter-spacing: -0.02em; margin: 0; }
.db-promo__pill {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 1px 10px; border-radius: 999px; background: var(--ink); color: #fff;
  font-size: 20px; font-weight: 800; margin: 0 2px;
}
.db-promo__back-intro { font-size: 13px; line-height: 1.5; color: rgba(10,10,10,0.72); margin: 10px 0 16px; }
.db-promo__steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.db-promo__step { display: flex; gap: 10px; align-items: flex-start; }
.db-promo__step-pct {
  flex-shrink: 0; min-width: 40px; text-align: center;
  padding: 3px 0; border-radius: 999px; background: var(--ink); color: #fff;
  font-size: 12px; font-weight: 800;
}
.db-promo__step-title { font-size: 14px; font-weight: 700; margin: 0; }
.db-promo__step-text { font-size: 12.5px; line-height: 1.45; color: rgba(10,10,10,0.72); margin: 2px 0 0; }
.db-promo__back-note { font-size: 12.5px; line-height: 1.45; font-weight: 600; margin: 18px 0 0; }
.db-promo__flip-hint { margin-top: auto; padding-top: 16px; font-size: 12px; font-weight: 600; color: rgba(10,10,10,0.55); text-align: center; }
@media (prefers-reduced-motion: reduce) {
  .db-promo__inner { transition-duration: 0.01s; }
  .db-card, .db-stack { transition-duration: 0.01s; }
  .db-tx-list .db-tx { animation: none; }
}

/* ── page-level loading/error ── */
.db-status {
  flex: 1; min-height: 60vh;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; color: var(--muted);
}
.db-status__retry {
  margin-left: 10px; border: 0; background: var(--ink); color: #fff;
  border-radius: 999px; padding: 6px 14px; font: inherit; font-size: 13px;
  font-weight: 600; cursor: pointer;
}

/* ── modal ── */
.db-modal-overlay {
  position: fixed; inset: 0; background: rgba(10,10,10,0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 20px; z-index: 100;
}
.db-modal {
  background: #fff; border-radius: 24px; width: 100%;
  max-height: 86vh; overflow-y: auto;
  box-shadow: 0 24px 64px rgba(10,10,10,0.28);
}
.db-modal--sm { max-width: 420px; }
.db-modal--md { max-width: 480px; }
.db-modal--lg { max-width: 620px; }
.db-modal__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 22px 16px; border-bottom: 1px solid var(--line);
  position: sticky; top: 0; background: #fff; border-radius: 24px 24px 0 0;
}
.db-modal__title { font-size: 17px; font-weight: 700; margin: 0; }
.db-modal__close {
  width: 32px; height: 32px; border-radius: 50%; border: 0;
  background: var(--bg); display: grid; place-items: center; cursor: pointer; color: var(--ink);
  flex-shrink: 0;
}
.db-modal__body { padding: 20px 22px 22px; }

.db-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.db-field__label { font-size: 12.5px; font-weight: 600; color: var(--muted); }
.db-field__row { display: flex; gap: 10px; }
.db-field__row .db-field { flex: 1; margin-bottom: 0; }
.db-input {
  height: 44px; border-radius: 12px; border: 1px solid var(--line);
  padding: 0 14px; font: inherit; font-size: 14px; color: var(--ink);
  background: #fbfcf8;
}
.db-input:focus { outline: 2px solid var(--lime-deep); outline-offset: 1px; border-color: transparent; }
.db-form-error {
  background: #fdecea; color: var(--danger); font-size: 13px;
  border-radius: 10px; padding: 10px 12px; margin-bottom: 14px;
}
.db-modal-tx { display: flex; flex-direction: column; gap: 14px; }
.db-modal-loading, .db-modal-empty { font-size: 13.5px; color: var(--muted); padding: 20px 0; text-align: center; }

@media (max-width: 1100px) {
  .db-grid { grid-template-columns: 1fr 1fr; }
  .db-grid__promo { grid-row: auto; }
}
@media (max-width: 760px) {
  .db-page { flex-direction: column; }
  .db-grid { grid-template-columns: 1fr; }
  .db-grid__promo { grid-row: auto; }
}
`;

/* ──────────────────────────────────────────────────────────────────────
   ICONS
   ────────────────────────────────────────────────────────────────────── */
const Svg = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const GearIcon = () => <Svg><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" /></Svg>;
const ChevronDown = () => <Svg size={14}><path d="m6 9 6 6 6-6" /></Svg>;
const ArrowRight = () => <Svg size={13}><path d="m9 6 6 6-6 6" /></Svg>;
const PlusIcon = () => <Svg size={16}><path d="M12 5v14M5 12h14" /></Svg>;
const CloseIcon = () => <Svg size={16}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
const UserIcon = () => <Svg size={16}><circle cx="12" cy="7.5" r="3.5" /><path d="M4.5 19.2a7.5 7.5 0 0 1 15 0" /></Svg>;
const LogoutIcon = () => <Svg size={16}><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" /><path d="M15 16l4-4-4-4" /><path d="M19 12H9" /></Svg>;

const BADGE_COLORS: Record<Transaction["badge"], string> = {
  paypal: "#1a73b8",
  twitch: "#9146ff",
  airbnb: "#ff5a5f",
  dribbble: "#ea4c89",
  other: "#6b716a",
};
const BADGE_INITIAL: Record<Transaction["badge"], string> = {
  paypal: "P",
  twitch: "T",
  airbnb: "A",
  dribbble: "D",
  other: "•",
};

/* ──────────────────────────────────────────────────────────────────────
   SMALL CHART HELPERS (pure SVG, no chart library dependency)
   ────────────────────────────────────────────────────────────────────── */
function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const mx = (p0.x + p1.x) / 2;
    d += ` C ${mx},${p0.y} ${mx},${p1.y} ${p1.x},${p1.y}`;
  }
  return d;
}

/* ──────────────────────────────────────────────────────────────────────
   MODAL SHELL
   ────────────────────────────────────────────────────────────────────── */
function Modal({
  title,
  onClose,
  children,
  size = "md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="db-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`db-modal db-modal--${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="db-modal__head">
          <h3 className="db-modal__title">{title}</h3>
          <button className="db-modal__close" type="button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="db-modal__body">{children}</div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   ACCOUNT MENU (dropdown under the user avatar/name)
   ────────────────────────────────────────────────────────────────────── */
function AccountMenu({
  user,
  onClose,
  onViewProfile,
  onLogout,
}: {
  user: { name: string; email: string };
  onClose: () => void;
  onViewProfile: () => void;
  onLogout: () => void;
}) {
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const el = document.getElementById("db-account-menu");
      if (el && !el.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [onClose]);

  return (
    <div className="db-account-menu" id="db-account-menu">
      <div className="db-account-menu__head">
        <p className="db-account-menu__name">{user.name}</p>
        {user.email && <p className="db-account-menu__email">{user.email}</p>}
      </div>
      <button className="db-account-menu__item" type="button" onClick={onViewProfile}>
        <UserIcon /> View profile
      </button>
      <button className="db-account-menu__item" type="button" onClick={onClose}>
        <GearIcon /> Settings
      </button>
      <button className="db-account-menu__item danger" type="button" onClick={onLogout}>
        <LogoutIcon /> Log out
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   PROFILE MODAL
   ────────────────────────────────────────────────────────────────────── */
function ProfileModal({
  user,
  onClose,
}: {
  user: { name: string; email: string; initials: string };
  onClose: () => void;
}) {
  return (
    <Modal title="Profile" onClose={onClose} size="sm">
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <span className="db-avatar" style={{ width: 56, height: 56, fontSize: 18 }}>
          {user.initials}
        </span>
        <div>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{user.name}</p>
          {user.email && (
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "2px 0 0" }}>{user.email}</p>
          )}
        </div>
      </div>
      <div className="db-field">
        <label className="db-field__label" htmlFor="profile-name">Name</label>
        <input id="profile-name" className="db-input" value={user.name} readOnly />
      </div>
      <div className="db-field">
        <label className="db-field__label" htmlFor="profile-email">Email</label>
        <input id="profile-email" className="db-input" value={user.email || "—"} readOnly />
      </div>
      <p className="db-empty-note" style={{ padding: 0 }}>
        Editing isn't wired up yet — this just shows what the API returned.
      </p>
    </Modal>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   ADD CARD MODAL
   ────────────────────────────────────────────────────────────────────── */
interface NewCardForm {
  nickname: string;
  lastFour: string;
  expiryMonth: string;
  expiryYear: string;
  creditLimit: string;
  currency: string;
}

const EMPTY_CARD_FORM: NewCardForm = {
  nickname: "",
  lastFour: "",
  expiryMonth: "",
  expiryYear: "",
  creditLimit: "",
  currency: "USD",
};

function AddCardModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (card: CardSummary) => void;
}) {
  const [form, setForm] = useState<NewCardForm>(EMPTY_CARD_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof NewCardForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): string | null {
    if (!form.nickname.trim()) return "Give the card a name.";
    if (!/^\d{4}$/.test(form.lastFour)) return "Last 4 digits must be exactly 4 numbers.";
    const month = parseInt(form.expiryMonth, 10);
    const year = parseInt(form.expiryYear, 10);
    if (!month || month < 1 || month > 12) return "Enter a valid expiry month (1–12).";
    if (!year || String(form.expiryYear).length !== 4) return "Enter a valid 4-digit expiry year.";
    if (form.creditLimit && Number.isNaN(Number(form.creditLimit))) return "Credit limit must be a number.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // POST /cards — payload mirrors the RawCard fields the dashboard
      // already reads.
      const created = await apiPost<RawCard>("/cards", {
        nickname: form.nickname.trim(),
        last_four: form.lastFour,
        expiry_month: parseInt(form.expiryMonth, 10),
        expiry_year: parseInt(form.expiryYear, 10),
        credit_limit: form.creditLimit ? Number(form.creditLimit) : 0,
        currency: form.currency.trim() || "USD",
      });
      const mapped = mapCard(created);
      if (mapped) onCreated(mapped);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the card. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Add new card" onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} noValidate>
        {error && <div className="db-form-error">{error}</div>}

        <div className="db-field">
          <label className="db-field__label" htmlFor="card-nickname">Card name</label>
          <input
            id="card-nickname"
            className="db-input"
            placeholder="e.g. Everyday spending"
            value={form.nickname}
            onChange={(e) => update("nickname", e.target.value)}
          />
        </div>

        <div className="db-field">
          <label className="db-field__label" htmlFor="card-last4">Last 4 digits</label>
          <input
            id="card-last4"
            className="db-input"
            placeholder="1234"
            inputMode="numeric"
            maxLength={4}
            value={form.lastFour}
            onChange={(e) => update("lastFour", e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>

        <div className="db-field__row">
          <div className="db-field">
            <label className="db-field__label" htmlFor="card-month">Expiry month</label>
            <input
              id="card-month"
              className="db-input"
              placeholder="MM"
              inputMode="numeric"
              maxLength={2}
              value={form.expiryMonth}
              onChange={(e) => update("expiryMonth", e.target.value.replace(/\D/g, "").slice(0, 2))}
            />
          </div>
          <div className="db-field">
            <label className="db-field__label" htmlFor="card-year">Expiry year</label>
            <input
              id="card-year"
              className="db-input"
              placeholder="YYYY"
              inputMode="numeric"
              maxLength={4}
              value={form.expiryYear}
              onChange={(e) => update("expiryYear", e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>
        </div>

        <div className="db-field__row">
          <div className="db-field">
            <label className="db-field__label" htmlFor="card-limit">Credit limit</label>
            <input
              id="card-limit"
              className="db-input"
              placeholder="0.00"
              inputMode="decimal"
              value={form.creditLimit}
              onChange={(e) => update("creditLimit", e.target.value)}
            />
          </div>
          <div className="db-field">
            <label className="db-field__label" htmlFor="card-currency">Currency</label>
            <input
              id="card-currency"
              className="db-input"
              placeholder="USD"
              maxLength={3}
              value={form.currency}
              onChange={(e) => update("currency", e.target.value.toUpperCase())}
            />
          </div>
        </div>

        <button type="submit" className="db-add-card-btn" disabled={submitting}>
          {submitting ? "Adding…" : "Add card"}
        </button>
      </form>
    </Modal>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   ADD TRANSACTION MODAL
   POST /api/v1/transactions — card balance/creditUsed now update
   server-side (transaction.service.js applies the delta inside the same
   DB transaction as the insert), and the response's embedded card
   reflects that updated state. onCreated below uses that returned card
   directly rather than computing a client-side delta.
   ────────────────────────────────────────────────────────────────────── */
interface NewTransactionForm {
  amount: string;
  merchant: string;
  type: "income" | "expense";
}

const EMPTY_TX_FORM: NewTransactionForm = {
  amount: "",
  merchant: "",
  type: "expense",
};

function AddTransactionModal({
  cards,
  defaultCardId,
  onClose,
  onCreated,
}: {
  cards: CardSummary[];
  defaultCardId: string | null;
  onClose: () => void;
  onCreated: (tx: Transaction, updatedCard: CardSummary | null, cardId: string) => void;
}) {
  const [form, setForm] = useState<NewTransactionForm>(EMPTY_TX_FORM);
  const [cardId, setCardId] = useState<string>(defaultCardId ?? cards[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof NewTransactionForm>(key: K, value: NewTransactionForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): string | null {
    if (!cardId) return "Add a card before recording a transaction.";
    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount) || amount <= 0) return "Enter an amount greater than 0.";
    if (!form.merchant.trim()) return "Enter a merchant or description.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiPost<CreateTransactionResponse>("/transactions", {
        amount: Number(form.amount),
        merchant: form.merchant.trim(),
        type: form.type,
        card_id: cardId,
      });
      const { card: rawCard, ...rawTx } = result.transaction;
      onCreated(mapTransaction(rawTx), mapCard(rawCard), cardId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the transaction. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New transaction" onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} noValidate>
        {error && <div className="db-form-error">{error}</div>}

        {cards.length === 0 && (
          <p className="db-empty-note" style={{ padding: "0 0 14px" }}>
            Add a card first, then you can record transactions on it.
          </p>
        )}

        <div className="db-field">
          <label className="db-field__label" htmlFor="tx-card">Card</label>
          <select
            id="tx-card"
            className="db-input"
            value={cardId}
            onChange={(e) => setCardId(e.target.value)}
            disabled={cards.length === 0}
          >
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.holderCardName} · *{c.last4}
              </option>
            ))}
          </select>
        </div>

        <div className="db-field">
          <label className="db-field__label">Type</label>
          <div className="db-toggle-row">
            <button
              type="button"
              className={`db-toggle-btn ${form.type === "expense" ? "active" : ""}`}
              onClick={() => update("type", "expense")}
            >
              Expense
            </button>
            <button
              type="button"
              className={`db-toggle-btn ${form.type === "income" ? "active" : ""}`}
              onClick={() => update("type", "income")}
            >
              Income
            </button>
          </div>
        </div>

        <div className="db-field">
          <label className="db-field__label" htmlFor="tx-merchant">Merchant / description</label>
          <input
            id="tx-merchant"
            className="db-input"
            placeholder="e.g. Whole Foods"
            value={form.merchant}
            onChange={(e) => update("merchant", e.target.value)}
          />
        </div>

        <div className="db-field">
          <label className="db-field__label" htmlFor="tx-amount">Amount</label>
          <input
            id="tx-amount"
            className="db-input"
            placeholder="0.00"
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => update("amount", e.target.value)}
          />
        </div>

        <button type="submit" className="db-add-card-btn" disabled={submitting || cards.length === 0}>
          {submitting ? "Adding…" : "Add transaction"}
        </button>
      </form>
    </Modal>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   ALL TRANSACTIONS MODAL
   ────────────────────────────────────────────────────────────────────── */
function AllTransactionsModal({
  cardId,
  cardName,
  onClose,
}: {
  cardId: string | null;
  cardName: string | null;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const params = new URLSearchParams({ limit: "100" });
        if (cardId) params.set("card_id", cardId);
        const result = await apiGet<{ transactions: RawTransaction[] }>(
          `/transactions?${params.toString()}`,
        );
        if (!cancelled) setItems(result.transactions.map(mapTransaction));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load transactions.");
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  return (
    <Modal
      title={cardName ? `Transactions · ${cardName}` : "All transactions"}
      onClose={onClose}
      size="lg"
    >
      {error && <div className="db-form-error">{error}</div>}
      {!error && items === null && <p className="db-modal-loading">Loading transactions…</p>}
      {!error && items !== null && items.length === 0 && (
        <p className="db-modal-empty">No transactions yet.</p>
      )}
      {!error && items !== null && items.length > 0 && (
        <div className="db-modal-tx">
          {items.map((tx) => (
            <div className="db-tx" key={tx.id}>
              <span className="db-tx__badge" style={{ background: BADGE_COLORS[tx.badge] }}>
                {BADGE_INITIAL[tx.badge]}
              </span>
              <div className="db-tx__info">
                <p className="db-tx__name">{tx.merchant}</p>
                <p className="db-tx__date">{tx.date}</p>
              </div>
              <span className="db-tx__amount">
                {tx.amount < 0 ? "- " : "+ "}${Math.abs(tx.amount).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   CARDS
   ────────────────────────────────────────────────────────────────────── */
/* Island: the white card shell. Its height is measured with a
   ResizeObserver and applied as an explicit pixel height with a CSS
   transition, so whenever the content changes size (a transaction is added,
   a card is added, Month/Week/Day is toggled, data finishes loading) the
   card eases to its new height instead of snapping. (`height: auto` can't
   be transitioned, which is why this is done in JS.) */
function Island({ children }: { children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="db-card" style={height === null ? undefined : { height: height + 2 }}>
      <div className="db-card__inner" ref={innerRef}>
        {children}
      </div>
    </div>
  );
}

function TransactionsCard({
  transactions,
  loading,
  error,
  cardLast4,
  onViewAll,
  onAddTransaction,
}: {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  cardLast4: string | null;
  onViewAll: () => void;
  onAddTransaction: () => void;
}) {
  return (
    <Island>
      <div className="db-card__head">
        <div>
          <h3 className="db-card__title">Recent transactions</h3>
          {cardLast4 && <p className="db-card__subtitle">For card ending in {cardLast4}</p>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="db-icon-btn" type="button" onClick={onAddTransaction} aria-label="Add transaction">
            <PlusIcon />
          </button>
          <button className="db-view-all" type="button" onClick={onViewAll}>
            View all <ArrowRight />
          </button>
        </div>
      </div>
      {loading ? (
        <p className="db-empty-note">Loading transactions…</p>
      ) : error ? (
        <div className="db-form-error">{error}</div>
      ) : transactions.length === 0 ? (
        <p className="db-empty-note">No transactions yet.</p>
      ) : (
        <div className="db-tx-list">
          {transactions.map((tx) => (
            <div className="db-tx" key={tx.id}>
              <span className="db-tx__badge" style={{ background: BADGE_COLORS[tx.badge] }}>
                {BADGE_INITIAL[tx.badge]}
              </span>
              <div className="db-tx__info">
                <p className="db-tx__name">{tx.merchant}</p>
                <p className="db-tx__date">{tx.date}</p>
              </div>
              <span className="db-tx__amount">
                {tx.amount < 0 ? "- " : "+ "}${Math.abs(tx.amount).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Island>
  );
}

const usd = (v: number) =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usdCompact = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${Math.round(v).toLocaleString()}`;

type PieKey = "expense" | "savings";
type PieRange = "all" | "month" | "week" | "day";

const PIE_RANGES: { key: PieRange; label: string; short: string; phrase: string }[] = [
  { key: "all", label: "All time", short: "all time", phrase: "across all time" },
  { key: "day", label: "Day", short: "today", phrase: "today" },
  { key: "week", label: "Week", short: "last 7 days", phrase: "over the last 7 days" },
  { key: "month", label: "Month", short: "this month", phrase: "this month" },
];

// GET /transactions rejects a `limit` above 100 (that was the error the
// 200-row requests were hitting), so the pie pages through results 100 at a
// time and sums them itself.
const PIE_PAGE_SIZE = 100;
const PIE_MAX_PAGES = 10; // safety cap: at most 1,000 transactions per period

// Day = today, Week = the last 7 days including today, Month = the calendar
// month so far, All time = no date filter.
function pieRangeBounds(range: PieRange): { start?: Date; end?: Date } {
  if (range === "all") return {};
  const start = startOfToday();
  if (range === "week") start.setDate(start.getDate() - 6);
  if (range === "month") start.setDate(1);
  return { start, end: endOfToday() };
}

/* Donut: the whole ring is the period's income, split into what was spent
   and what was kept. Hover a slice (or its legend row) to read it in the
   centre. If expenses exceed income the ring is all expenses and a note
   says by how much. */
function IncomePie({
  income,
  expense,
  short,
  phrase,
}: {
  income: number;
  expense: number;
  short: string;
  phrase: string;
}) {
  const [hover, setHover] = useState<PieKey | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const savings = Math.max(0, income - expense);
  const total = Math.max(income, expense);

  if (total <= 0) {
    return <p className="db-empty-note">No income or expenses recorded {phrase} yet.</p>;
  }

  const overspent = expense > income;
  const pctOfIncome = (v: number) => (income > 0 ? Math.round((v / income) * 100) : null);

  const slices: { key: PieKey; label: string; value: number; color: string }[] = [
    { key: "expense", label: "Expenses", value: expense, color: "var(--ink)" },
    { key: "savings", label: "Savings", value: savings, color: "var(--lime)" },
  ];

  const c = 100;
  const r = 74;
  const sw = 22;
  const C = 2 * Math.PI * r;
  const gap = 6;
  const nonZero = slices.filter((sl) => sl.value > 0).length;

  let cursor = 0;
  const arcs = slices.map((sl) => {
    const arc = (sl.value / total) * C;
    const start = cursor;
    cursor += arc;
    if (sl.value <= 0) return { ...sl, dash: `0 ${C}`, offset: 0, round: true };
    if (nonZero === 1) return { ...sl, dash: `${C} 0`, offset: 0, round: false };
    // rounded caps extend by sw/2 at each end, so shorten the dash to keep a clean gap
    const len = Math.max(0.01, arc - gap - sw);
    return { ...sl, dash: `${len} ${C - len}`, offset: -(start + gap / 2 + sw / 2), round: true };
  });

  const focus = slices.find((sl) => sl.key === hover) ?? null;
  const centreLabel = focus ? focus.label : "Income";
  const centreValue = usdCompact(focus ? focus.value : income);
  const centreSub = focus
    ? pctOfIncome(focus.value) !== null
      ? `${pctOfIncome(focus.value)}% of income`
      : "no income yet"
    : short;

  const savedPct = pctOfIncome(savings);

  return (
    <div className="db-pie-wrap">
      <svg
        className="db-pie"
        viewBox="0 0 200 200"
        role="img"
        aria-label={`${short}: income ${usd(income)}, expenses ${usd(expense)}, savings ${usd(savings)}.`}
      >
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line)" strokeWidth={sw} opacity={0.6} />
        <g transform={`rotate(-90 ${c} ${c})`}>
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={hover === a.key ? sw + 4 : sw}
              strokeLinecap={a.round ? "round" : "butt"}
              strokeDasharray={ready ? a.dash : `0 ${C}`}
              strokeDashoffset={a.offset}
              style={{
                opacity: hover && hover !== a.key ? 0.35 : 1,
                transition:
                  "stroke-dasharray 0.9s cubic-bezier(0.3, 0.7, 0.2, 1), stroke-width 0.2s ease, opacity 0.2s ease",
                cursor: "pointer",
              }}
              onMouseEnter={() => setHover(a.key)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </g>
        <text x={c} y={c - 12} textAnchor="middle" className="db-pie__label">{centreLabel}</text>
        <text x={c} y={c + 14} textAnchor="middle" className="db-pie__value">{centreValue}</text>
        <text x={c} y={c + 32} textAnchor="middle" className="db-pie__sub">{centreSub}</text>
      </svg>

      <ul className="db-pie-legend">
        <li className="db-pie-legend__row">
          <span
            className="db-pie-legend__dot"
            style={{ background: "conic-gradient(var(--ink) 0 50%, var(--lime) 0)" }}
          />
          <div className="db-pie-legend__text">
            <p className="db-pie-legend__name">Income</p>
            <p className="db-pie-legend__hint">Total earned {phrase}</p>
          </div>
          <span className="db-pie-legend__amount">{usd(income)}</span>
        </li>
        {slices.map((sl) => {
          const pct = pctOfIncome(sl.value);
          return (
            <li
              key={sl.key}
              className={`db-pie-legend__row db-pie-legend__row--hoverable ${hover === sl.key ? "is-active" : ""}`}
              onMouseEnter={() => setHover(sl.key)}
              onMouseLeave={() => setHover(null)}
            >
              <span
                className="db-pie-legend__dot"
                style={{ background: sl.color, border: sl.key === "savings" ? "1px solid var(--lime-deep)" : "none" }}
              />
              <div className="db-pie-legend__text">
                <p className="db-pie-legend__name">{sl.label}</p>
                <p className="db-pie-legend__hint">
                  {sl.key === "expense" ? "Total spent" : "Income left over"}
                  {pct !== null ? ` · ${pct}% of income` : ""}
                </p>
              </div>
              <span className="db-pie-legend__amount">{usd(sl.value)}</span>
            </li>
          );
        })}
      </ul>

      <p className="db-pie__insight">
        {overspent ? (
          <>You spent <strong>{usd(expense - income)}</strong> more than you earned {phrase}.</>
        ) : income > 0 ? (
          <>You kept <strong>{savedPct}%</strong> of your income {phrase} — <strong>{usd(savings)}</strong> saved.</>
        ) : null}
      </p>
    </div>
  );
}

/* Pages through /transactions for a period (max 100 rows per request) and
   returns everything it found. Page 1 uses exactly the params the rest of
   the app already sends. For page 2+ it adds `page`; if the backend rejects
   that, or ignores it and returns the same rows again, it stops and flags
   the result as partial instead of double-counting or failing. */
async function fetchTransactionsForRange(
  range: PieRange,
): Promise<{ transactions: RawTransaction[]; truncated: boolean }> {
  const { start, end } = pieRangeBounds(range);
  const seen = new Map<string, RawTransaction>();

  for (let page = 1; page <= PIE_MAX_PAGES; page++) {
    const params = new URLSearchParams({ limit: String(PIE_PAGE_SIZE) });
    if (start && end) {
      params.set("start_date", start.toISOString());
      params.set("end_date", end.toISOString());
    }
    if (page > 1) params.set("page", String(page));

    let batch: RawTransaction[];
    try {
      const res = await apiGet<{ transactions: RawTransaction[] }>(`/transactions?${params.toString()}`);
      batch = res.transactions;
    } catch (err) {
      if (page === 1) throw err;
      return { transactions: [...seen.values()], truncated: true };
    }

    const before = seen.size;
    for (const tx of batch) seen.set(tx.id, tx);

    if (batch.length < PIE_PAGE_SIZE) return { transactions: [...seen.values()], truncated: false };
    if (seen.size === before) return { transactions: [...seen.values()], truncated: true };
  }
  return { transactions: [...seen.values()], truncated: true };
}

/* Spending island: the income / expenses / savings donut with its own
   All time / Day / Week / Month selector. Totals are summed client-side
   from the transactions in the chosen period. */
function SpendingCard({ refreshKey }: { refreshKey: number }) {
  const [range, setRange] = useState<PieRange>("month");
  const [result, setResult] = useState<{
    range: PieRange;
    income: number;
    expense: number;
    count: number;
    truncated: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    async function run() {
      try {
        const { transactions, truncated } = await fetchTransactionsForRange(range);
        if (cancelled) return;
        let income = 0;
        let expense = 0;
        for (const tx of transactions) {
          const amt = Math.abs(toNumber(tx.amount));
          if (tx.type === "income") income += amt;
          else expense += amt;
        }
        setResult({ range, income, expense, count: transactions.length, truncated });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load this period.");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [range, refreshKey]);

  const shown = result ? PIE_RANGES.find((r) => r.key === result.range)! : null;
  const loading = !error && (!result || result.range !== range);

  return (
    <Island>
      <div className="db-card__head">
        <h3 className="db-card__title">Spending</h3>
        <div className="db-toggle-row db-toggle-row--sm">
          {PIE_RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`db-toggle-btn ${range === r.key ? "active" : ""}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="db-form-error">{error}</div>}
      {!error && !result && <p className="db-empty-note">Loading…</p>}
      {result && shown && (
        <div style={{ opacity: loading ? 0.45 : 1, transition: "opacity 0.2s ease" }}>
          <IncomePie
            key={`${result.range}-${result.income}-${result.expense}`}
            income={result.income}
            expense={result.expense}
            short={shown.short}
            phrase={shown.phrase}
          />
          {result.truncated && (
            <p className="db-pie-note">Based on the {result.count} most recent transactions in this period.</p>
          )}
        </div>
      )}
    </Island>
  );
}

/* Stacked cards. `cards` keeps a STABLE order so React never moves the DOM
   nodes (moving a node would kill its CSS transition); `order` is the
   front → back stack order and only drives each card's --pos. Clicking the
   stack runs a two-phase swap: the front card lifts out (.is-leaving),
   then `onCycle` rotates the order, so it drops behind while the card that
   was behind it slides forward. */
function CreditCardWidget({
  cards,
  order,
  onCycle,
  onAddCard,
}: {
  cards: CardSummary[];
  order: string[];
  onCycle: () => void;
  onAddCard: () => void;
}) {
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (cards.length === 0) {
    return (
      <Island>
        <p className="db-empty-note">You don't have a card yet.</p>
        <button type="button" className="db-add-card-btn" onClick={onAddCard}>
          <PlusIcon /> Add new card
        </button>
      </Island>
    );
  }

  const n = cards.length;
  const front = cards.find((c) => c.id === order[0]) ?? cards[0];
  const frontNumber = cards.findIndex((c) => c.id === front.id) + 1;
  const canCycle = n > 1;

  function cycle() {
    if (!canCycle || leavingId) return;
    setLeavingId(front.id);
    timer.current = window.setTimeout(() => {
      onCycle();
      setLeavingId(null);
      timer.current = null;
    }, 260);
  }

  return (
    <Island>
      <div className="db-card-stack">
        <div
          className={`db-stack ${canCycle ? "db-stack--clickable" : ""}`}
          style={{ height: 150 + Math.min(n - 1, 2) * 12 }}
          onClick={cycle}
          onKeyDown={(e) => {
            if (canCycle && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              cycle();
            }
          }}
          role={canCycle ? "button" : undefined}
          tabIndex={canCycle ? 0 : undefined}
          aria-label={canCycle ? `Card ${frontNumber} of ${n}. Activate to bring the next card forward.` : undefined}
        >
          {cards.map((c, i) => {
            const idx = order.indexOf(c.id);
            const pos = idx === -1 ? n - 1 : idx;
            const [whole, cents] = c.creditLimit.toFixed(2).split(".");
            const classes = [
              "db-visual-card",
              `db-visual-card--v${i % 4}`,
              pos > 2 ? "is-hidden" : "",
              leavingId === c.id ? "is-leaving" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div
                key={c.id}
                className={classes}
                style={{ "--pos": Math.min(pos, 2), zIndex: n - pos } as CSSProperties}
                aria-hidden={pos !== 0}
              >
                <svg
                  className="db-visual-card__chip"
                  viewBox="0 0 40 30"
                  width="40"
                  height="30"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <rect x="1" y="1" width="38" height="28" rx="6" fill="currentColor" fillOpacity="0.14" />
                  <rect x="14" y="8" width="12" height="14" rx="3" />
                  <path d="M1 11h13M1 19h13M26 11h13M26 19h13M20 1v7M20 22v7" />
                </svg>
                <p className="db-visual-card__name">{c.holderCardName}</p>
                <div className="db-visual-card__balance">
                  ${Number(whole).toLocaleString()}<small>.{cents}</small>
                </div>
                <div className="db-visual-card__foot">
                  <span>*{c.last4} {c.expiry}</span>
                  <span>{c.network}</span>
                </div>
              </div>
            );
          })}
        </div>
        {canCycle && (
          <p className="db-stack-hint">Card {frontNumber} of {n} · tap to switch</p>
        )}
      </div>
      <div className="db-card-meta">
        <div className="db-card-meta__row">
          <span className="db-card-meta__label">Credit used</span>
          <span className="db-card-meta__value">${front.creditUsed.toFixed(2)}</span>
        </div>
        <div className="db-card-meta__row">
          <span className="db-card-meta__label">Currency</span>
          <span className="db-card-meta__value">{front.currency}</span>
        </div>
      </div>
      <button type="button" className="db-add-card-btn" onClick={onAddCard}>
        <PlusIcon /> Add new card
      </button>
    </Island>
  );
}

function BudgetCard({ points }: { points: BudgetPoint[] }) {
  const width = 560;
  const height = 240;
  const padL = 30;
  const padB = 26;
  const padT = 12;
  const chartW = width - padL - 12;
  const chartH = height - padB - padT;

  // Dynamic ceiling instead of a hardcoded 7000, since real spend data
  // has no fixed range. Ticks stay evenly spaced at 1/7th of the max,
  // same visual rhythm as before.
  const max = Math.max(1000, ...points.map((p) => p.value), 1);
  const yTicks = useMemo(
    () => Array.from({ length: 8 }, (_, i) => Math.round((max / 7) * i)),
    [max],
  );

  const coords = useMemo(
    () =>
      points.map((p, i) => ({
        x: points.length > 1 ? padL + (i / (points.length - 1)) * chartW : padL + chartW / 2,
        y: padT + chartH - (Math.min(p.value, max) / max) * chartH,
        ...p,
      })),
    [points, max],
  );

  if (points.length === 0) {
    return (
      <Island>
        <div className="db-budget-head">
          <h3 className="db-card__title">Budget</h3>
        </div>
        <p className="db-empty-note">Not enough data yet to chart spending over time.</p>
      </Island>
    );
  }

  const highlightIndex = Math.min(3, coords.length - 1);
  const highlight = coords[highlightIndex];
  const path = smoothPath(coords);

  return (
    <Island>
      <div className="db-budget-head">
        <h3 className="db-card__title">Budget</h3>
        <button className="db-pill-select" type="button">Month <ChevronDown /></button>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="auto" role="img" aria-label="Budget over time">
        {yTicks.map((t) => {
          const y = padT + chartH - (t / max) * chartH;
          return (
            <g key={t}>
              <line x1={padL} y1={y} x2={width - 12} y2={y} stroke="var(--line)" strokeDasharray="3 4" />
              <text x={4} y={y + 4} className="db-axis-label">{t === 0 ? "0" : `${Math.round(t / 1000)}k`}</text>
            </g>
          );
        })}
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth={2} />
        {coords.map((c) => (
          <text key={c.label} x={c.x} y={height - 4} textAnchor="middle" className="db-axis-label">{c.label}</text>
        ))}
        {highlight && (
          <g>
            <line x1={highlight.x} y1={padT} x2={highlight.x} y2={chartH + padT} stroke="var(--line)" />
            <circle cx={highlight.x} cy={highlight.y} r={5} fill="var(--lime)" stroke="var(--ink)" strokeWidth={1.5} />
            <g transform={`translate(${highlight.x - 46}, ${highlight.y - 42})`}>
              <rect className="db-tooltip-bubble" width={92} height={28} rx={14} />
              <text x={46} y={19} textAnchor="middle" className="db-tooltip-text">
                ${highlight.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </text>
            </g>
          </g>
        )}
      </svg>
    </Island>
  );
}

/* Image-based ad that flips. The front is the ad image (heading, piggy bank
   and coins are baked into Assets.ts → `promo`); the back explains how the
   25% is reached. The whole card is the click target — no separate button. */
const SAVINGS_PLAN: { pct: number; title: string; text: string }[] = [
  {
    pct: 8,
    title: "Subscriptions & memberships",
    text: "Cancel anything you haven't used in the last 30 days, downgrade plans you rarely max out, and share family plans where you can.",
  },
  {
    pct: 7,
    title: "Dining & takeaway",
    text: "Set a weekly cap and cook at home a few more nights. Small swaps add up faster than cutting out meals you enjoy.",
  },
  {
    pct: 6,
    title: "Impulse & small purchases",
    text: "Wait 24 hours before buying anything non-essential. Most of the urge passes, and so does the spend.",
  },
  {
    pct: 4,
    title: "Bills & fees",
    text: "Renegotiate or switch providers on recurring bills, and avoid late, overdraft and ATM fees.",
  },
];

function PromoCard() {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className={`db-promo ${flipped ? "is-flipped" : ""}`}
      onClick={() => setFlipped((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setFlipped((v) => !v);
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={flipped ? "How to reduce expenses by 25%. Activate to flip back." : "How to reduce expenses by 25%. Activate to see how."}
    >
      <div className="db-promo__inner">
        <div className="db-promo__face db-promo__face--front" aria-hidden={flipped}>
          <img className="db-promo__img" src={promo} alt="" />
        </div>

        <div className="db-promo__face db-promo__face--back" aria-hidden={!flipped}>
          <h3 className="db-promo__back-title">
            How the <span className="db-promo__pill">25%</span> adds up
          </h3>
          <p className="db-promo__back-intro">
            A suggested split: trim a little from each area rather than a lot from one.
          </p>
          <ul className="db-promo__steps">
            {SAVINGS_PLAN.map((item) => (
              <li className="db-promo__step" key={item.title}>
                <span className="db-promo__step-pct">{item.pct}%</span>
                <div>
                  <p className="db-promo__step-title">{item.title}</p>
                  <p className="db-promo__step-text">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="db-promo__back-note">
            Check the Spending chart to see which areas are biggest for you, and start there.
          </p>
          <span className="db-promo__flip-hint">Tap to flip back</span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   PAGE
   ────────────────────────────────────────────────────────────────────── */
type LoadStatus = "loading" | "ready" | "error";
type OpenModal = "addCard" | "addTransaction" | "allTransactions" | "profile" | null;

export default function Dashboard() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Stack order of the user's cards, front first. Clicking the stack rotates it.
  const [cardOrder, setCardOrder] = useState<string[]>([]);
  // Recent transactions per card id, fetched lazily when a card comes to the front.
  const [recentByCard, setRecentByCard] = useState<Record<string, Transaction[]>>({});
  const [recentError, setRecentError] = useState<string | null>(null);
  // Bumped whenever a transaction is added, so the Spending charts refetch.
  const [txVersion, setTxVersion] = useState(0);

  const [openModal, setOpenModal] = useState<OpenModal>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setStatus("loading");
      setError(null);
      try {
        const result = await loadDashboardData();
        if (!cancelled) {
          setData(result);
          setCardOrder(result.cards.map((c) => c.id));
          setRecentByCard({});
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong.");
          setStatus("error");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  // Cards in stack order (front first) and the one currently in front.
  const orderedCards = useMemo(() => {
    if (!data) return [] as CardSummary[];
    return cardOrder
      .map((id) => data.cards.find((c) => c.id === id))
      .filter((c): c is CardSummary => !!c);
  }, [data, cardOrder]);
  const activeCard = orderedCards[0] ?? null;
  const activeCardId = activeCard?.id ?? null;

  // Fetch the recent transactions of whichever card is in front (once per card).
  useEffect(() => {
    if (!activeCardId || recentByCard[activeCardId]) return;
    let cancelled = false;
    setRecentError(null);

    async function run() {
      try {
        const params = new URLSearchParams({ limit: "8", card_id: activeCardId as string });
        const result = await apiGet<{ transactions: RawTransaction[] }>(
          `/transactions?${params.toString()}`,
        );
        if (!cancelled) {
          setRecentByCard((prev) => ({
            ...prev,
            [activeCardId as string]: result.transactions.map(mapTransaction),
          }));
        }
      } catch (err) {
        if (!cancelled) {
          setRecentError(err instanceof Error ? err.message : "Couldn't load transactions.");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [activeCardId, recentByCard]);

  const recent = activeCardId ? recentByCard[activeCardId] : undefined;
  const recentLoading = !!activeCardId && recent === undefined && !recentError;

  function handleCycleCards() {
    setCardOrder((o) => (o.length > 1 ? [...o.slice(1), o[0]] : o));
  }

  function handleCardCreated(card: CardSummary) {
    setData((prev) => (prev ? { ...prev, cards: [...prev.cards, card] } : prev));
    // The card you just added comes to the front.
    setCardOrder((o) => [card.id, ...o.filter((id) => id !== card.id)]);
  }

  function handleTransactionCreated(tx: Transaction, updatedCard: CardSummary | null, cardId: string) {
    // Use the card the backend returned inline — it's the real post-transaction
    // balance/creditUsed, not an estimate.
    if (updatedCard) {
      setData((prev) =>
        prev ? { ...prev, cards: prev.cards.map((c) => (c.id === updatedCard.id ? updatedCard : c)) } : prev,
      );
    }
    // Tell the Spending island's transaction-based charts to refetch.
    setTxVersion((v) => v + 1);
    // If that card's list is already loaded, prepend. If not, it will be
    // fetched (and already include this transaction) when it comes forward.
    setRecentByCard((prev) => (prev[cardId] ? { ...prev, [cardId]: [tx, ...prev[cardId]] } : prev));
    // Bring the card you posted to forward so the new transaction is visible.
    setCardOrder((o) => [cardId, ...o.filter((id) => id !== cardId)]);
  }

  function handleLogout() {
    sessionStorage.removeItem("accessToken");
    setAccountMenuOpen(false);
    window.location.href = "/login";
  }

  return (
    <div className="db-page">
      <style>{styles}</style>

      <main className="db-main">
        <header className="db-header">
          <h1 className="db-title">Dashboard</h1>
          <div className="db-header__right">
            <button
              className="db-user"
              type="button"
              onClick={() => setAccountMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
            >
              <span className="db-avatar">{data?.user.initials ?? "…"}</span>
              <span className="db-user__name">{data?.user.name ?? "Loading…"}</span>
              {data && accountMenuOpen && (
                <AccountMenu
                  user={data.user}
                  onClose={() => setAccountMenuOpen(false)}
                  onViewProfile={() => {
                    setAccountMenuOpen(false);
                    setOpenModal("profile");
                  }}
                  onLogout={handleLogout}
                />
              )}
            </button>
          </div>
        </header>

        {status === "loading" && <div className="db-status">Loading your dashboard…</div>}

        {status === "error" && (
          <div className="db-status">
            {error}
            <button className="db-status__retry" type="button" onClick={() => setReloadToken((n) => n + 1)}>
              Retry
            </button>
          </div>
        )}

        {status === "ready" && data && (
          <div className="db-grid">
            <div className="db-grid__col1">
              <TransactionsCard
                transactions={recent ?? []}
                loading={recentLoading}
                error={recentError}
                cardLast4={activeCard?.last4 ?? null}
                onViewAll={() => setOpenModal("allTransactions")}
                onAddTransaction={() => setOpenModal("addTransaction")}
              />
              <CreditCardWidget
                cards={data.cards}
                order={cardOrder}
                onCycle={handleCycleCards}
                onAddCard={() => setOpenModal("addCard")}
              />
            </div>

            <div className="db-grid__col2">
              <SpendingCard refreshKey={txVersion} />
              <BudgetCard points={data.budget} />
            </div>

            <div className="db-grid__promo">
              <PromoCard />
            </div>
          </div>
        )}
      </main>

      {openModal === "addCard" && (
        <AddCardModal onClose={() => setOpenModal(null)} onCreated={handleCardCreated} />
      )}
      {openModal === "addTransaction" && (
        <AddTransactionModal
          cards={orderedCards}
          defaultCardId={activeCardId}
          onClose={() => setOpenModal(null)}
          onCreated={handleTransactionCreated}
        />
      )}
      {openModal === "allTransactions" && (
        <AllTransactionsModal
          cardId={activeCard?.id ?? null}
          cardName={activeCard?.holderCardName ?? null}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "profile" && data && (
        <ProfileModal user={data.user} onClose={() => setOpenModal(null)} />
      )}
    </div>
  );
}
