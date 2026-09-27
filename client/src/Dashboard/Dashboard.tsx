import { useEffect, useMemo, useState, type ReactNode } from "react";

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

interface RadarRow {
  category_id: string | null;
  name: string;
  this_period: number;
  average: number;
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

function bucketByHour(transactions: RawTransaction[]): number[] {
  const hours = new Array(24).fill(0) as number[];
  for (const tx of transactions) {
    if (tx.type !== "expense") continue;
    const d = new Date(tx.occurredAt);
    const hour = d.getHours();
    hours[hour] += Math.abs(toNumber(tx.amount));
  }
  return hours;
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

interface SpendingCategory {
  label: string;
  thisMonth: number; // 0–100, normalized client-side (see mapping below)
  average: number; // 0–100
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
  transactions: Transaction[];
  spending: SpendingCategory[];
  card: CardSummary | null;
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

  const [dashboard, me, radar, overTime] = await Promise.all([
    apiGet<DashboardResponse>("/dashboard"),
    apiGet<MeResponse>("/auth/me"),
    apiGet<{ radar: RadarRow[] }>("/analytics/spending-radar"),
    apiGet<{ spending_over_time: SpendingOverTimeRow[] }>(
      `/analytics/spending-over-time?${timelineParams.toString()}`,
    ),
  ]);

  // ── transactions ──
  const allTransactions: Transaction[] = dashboard.recent_transactions.map(mapTransaction);

  // ── primary card: is_default, else the first (cards are already
  // ordered isDefault desc by card.repository.findAllForUser) ──
  const rawPrimary = dashboard.cards.find((c) => c.isDefault) ?? dashboard.cards[0] ?? null;
  const card = mapCard(rawPrimary);

  // "Recent transactions" is scoped to the card shown in the credit-card
  // widget, matched on cardId (confirmed against POST /transactions'
  // response — the raw field is camelCase, not card_id). If a transaction
  // has no cardId it's left out of this scoped view rather than silently
  // attributed to the wrong card.
  const transactions: Transaction[] = card
    ? allTransactions.filter((tx) => tx.cardId === card.id)
    : allTransactions;

  // ── spending radar: real dollar amounts normalized to a 0–100 scale
  // against the largest value in the set, so the radar shape is
  // preserved even though the chart itself assumes a 0–100 range. ──
  const radarRows = radar.radar;
  const maxRadarValue = Math.max(1, ...radarRows.flatMap((r) => [r.this_period, r.average]));
  const spending: SpendingCategory[] = radarRows.map((r) => ({
    label: r.name,
    thisMonth: Math.round((r.this_period / maxRadarValue) * 100),
    average: Math.round((r.average / maxRadarValue) * 100),
  }));

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

  return { transactions, spending, card, budget, user };
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
.db-grid__promo { grid-row: 1 / span 2; height: 100%; }

.db-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 24px;
  padding: 22px;
}
.db-card__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
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
.db-legend { display: flex; align-items: center; gap: 14px; font-size: 12.5px; color: var(--muted); }
.db-legend__item { display: flex; align-items: center; gap: 6px; }
.db-legend__swatch { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.db-radar-label { font-size: 11.5px; fill: var(--muted); font-family: inherit; }

/* ── credit card widget ── */
.db-card-stack { position: relative; margin-bottom: 26px; }
.db-visual-card {
  position: relative;
  background: var(--lime);
  border-radius: 20px;
  padding: 18px 20px 16px;
  min-height: 130px;
}
.db-visual-card__chip { width: 34px; height: 24px; border-radius: 6px; background: rgba(10,10,10,0.15); position: absolute; top: 18px; right: 20px; }
.db-visual-card__name { font-size: 15px; font-weight: 700; margin: 0 0 14px; }
.db-visual-card__balance { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
.db-visual-card__balance small { font-size: 15px; font-weight: 700; }
.db-visual-card__foot { display: flex; align-items: flex-end; justify-content: space-between; margin-top: 22px; font-size: 13px; font-weight: 600; letter-spacing: 0.03em; }

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

/* ── promo card (now stretches to fill the tall spanning cell) ── */
.db-promo {
  background: var(--lime);
  border-radius: 24px;
  padding: 26px 24px;
  display: flex; flex-direction: column;
  height: 100%;
  min-height: 300px;
}
.db-promo__heading { font-size: 30px; font-weight: 800; line-height: 1.08; letter-spacing: -0.02em; margin: 0; }
.db-promo__body { font-size: 13.5px; color: rgba(10,10,10,0.7); line-height: 1.5; margin: 10px 0 0; }
.db-tips-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 10px; font-size: 14px; line-height: 1.5; }
.db-promo__pill {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 2px 10px; border-radius: 999px; background: var(--ink); color: #fff;
  font-size: 22px; font-weight: 800; margin: 0 2px;
}
.db-promo__art { flex: 1; display: flex; align-items: flex-end; justify-content: flex-end; margin: 12px 0; }
.db-promo__cta {
  width: 100%; height: 46px; border-radius: 999px; border: 0;
  background: #fff; color: var(--ink); font: inherit; font-size: 14px; font-weight: 700;
  cursor: pointer;
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
  .db-grid__promo { grid-row: auto; height: auto; }
}
@media (max-width: 760px) {
  .db-page { flex-direction: column; }
  .db-grid { grid-template-columns: 1fr; }
  .db-grid__promo { grid-row: auto; height: auto; }
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
const InboxIcon = () => <Svg><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></Svg>;
const GearIcon = () => <Svg><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" /></Svg>;
const BellIcon = () => <Svg><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 19a2 2 0 0 0 4 0" /></Svg>;
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
function radarPolygon(values: number[], cx: number, cy: number, radius: number, max = 100) {
  const n = values.length;
  return values
    .map((v, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const r = (Math.max(0, Math.min(v, max)) / max) * radius;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

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
  card,
  onClose,
  onCreated,
}: {
  card: CardSummary | null;
  onClose: () => void;
  onCreated: (tx: Transaction, updatedCard: CardSummary | null) => void;
}) {
  const [form, setForm] = useState<NewTransactionForm>(EMPTY_TX_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof NewTransactionForm>(key: K, value: NewTransactionForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): string | null {
    if (!card) return "Add a card before recording a transaction.";
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
    if (!card) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiPost<CreateTransactionResponse>("/transactions", {
        amount: Number(form.amount),
        merchant: form.merchant.trim(),
        type: form.type,
        card_id: card.id,
      });
      const { card: rawCard, ...rawTx } = result.transaction;
      onCreated(mapTransaction(rawTx), mapCard(rawCard));
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

        {card && (
          <p className="db-empty-note" style={{ padding: "0 0 14px" }}>
            Posting to card ending in {card.last4}.
          </p>
        )}

        <div className="db-field">
          <label className="db-field__label" htmlFor="tx-type">Type</label>
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

        <button type="submit" className="db-add-card-btn" disabled={submitting || !card}>
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
function TransactionsCard({
  transactions,
  cardLast4,
  onViewAll,
  onAddTransaction,
}: {
  transactions: Transaction[];
  cardLast4: string | null;
  onViewAll: () => void;
  onAddTransaction: () => void;
}) {
  return (
    <div className="db-card">
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
      {transactions.length === 0 ? (
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
    </div>
  );
}

/* ── Spending card: Month/Week (radar, existing data) + Day (24hr bar
   chart, freshly fetched and bucketed client-side per hour).
   Known limitation: "Week" reuses the same `categories` prop as "Month"
   since the backend doesn't expose a separate weekly-vs-average dataset
   today — it's a relabeled view of the same numbers, not a real week
   slice. ── */
type SpendingRange = "month" | "week" | "day";

function HourlyBarChart({ hours }: { hours: number[] }) {
  const width = 560;
  const height = 220;
  const padL = 34;
  const padB = 22;
  const padT = 10;
  const chartW = width - padL - 10;
  const chartH = height - padB - padT;

  const max = Math.max(1, ...hours);
  const barW = chartW / 24;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="auto"
      role="img"
      aria-label="Spending by hour, last 24 hours"
    >
      {[0, 0.5, 1].map((f) => {
        const y = padT + chartH - f * chartH;
        return <line key={f} x1={padL} y1={y} x2={width - 10} y2={y} stroke="var(--line)" strokeDasharray="3 4" />;
      })}
      {hours.map((v, h) => {
        const barH = (v / max) * chartH;
        const x = padL + h * barW;
        const y = padT + chartH - barH;
        return (
          <rect
            key={h}
            x={x + 1}
            y={y}
            width={Math.max(1, barW - 2)}
            height={Math.max(0, barH)}
            fill="var(--lime-deep)"
            rx={2}
          />
        );
      })}
      {[0, 6, 12, 18, 23].map((h) => (
        <text
          key={h}
          x={padL + h * barW + barW / 2}
          y={height - 4}
          textAnchor="middle"
          className="db-axis-label"
        >
          {h}:00
        </text>
      ))}
    </svg>
  );
}

function SpendingCard({ categories }: { categories: SpendingCategory[] }) {
  const [range, setRange] = useState<SpendingRange>("month");
  const [hourly, setHourly] = useState<number[] | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);
  const [dayLoading, setDayLoading] = useState(false);

  useEffect(() => {
    if (range !== "day") return;
    let cancelled = false;

    async function run() {
      setDayLoading(true);
      setDayError(null);
      try {
        const params = new URLSearchParams({
          start_date: startOfToday().toISOString(),
          end_date: endOfToday().toISOString(),
          limit: "200",
        });
        const result = await apiGet<{ transactions: RawTransaction[] }>(
          `/transactions?${params.toString()}`,
        );
        if (!cancelled) setHourly(bucketByHour(result.transactions));
      } catch (err) {
        if (!cancelled) {
          setDayError(err instanceof Error ? err.message : "Couldn't load today's spending.");
        }
      } finally {
        if (!cancelled) setDayLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const size = 260;
  const cx = size / 2;
  const cy = size / 2 + 6;
  const radius = 92;
  const n = categories.length;
  const rings = [0.33, 0.66, 1];
  const thisMonthPts = radarPolygon(categories.map((c) => c.thisMonth), cx, cy, radius);
  const averagePts = radarPolygon(categories.map((c) => c.average), cx, cy, radius);

  return (
    <div className="db-card">
      <div className="db-card__head">
        <h3 className="db-card__title">Spending</h3>
        <div className="db-toggle-row" style={{ width: "auto" }}>
          <button
            type="button"
            className={`db-toggle-btn ${range === "month" ? "active" : ""}`}
            onClick={() => setRange("month")}
          >
            Month
          </button>
          <button
            type="button"
            className={`db-toggle-btn ${range === "week" ? "active" : ""}`}
            onClick={() => setRange("week")}
          >
            Week
          </button>
          <button
            type="button"
            className={`db-toggle-btn ${range === "day" ? "active" : ""}`}
            onClick={() => setRange("day")}
          >
            Day
          </button>
        </div>
      </div>

      {range !== "day" && n === 0 && (
        <p className="db-empty-note">Not enough data yet to chart spending by category.</p>
      )}

      {range !== "day" && n > 0 && (
        <>
          <div className="db-legend" style={{ marginBottom: 10 }}>
            <span className="db-legend__item">
              <span className="db-legend__swatch" style={{ background: "var(--lime)" }} /> This {range}
            </span>
            <span className="db-legend__item">
              <span className="db-legend__swatch" style={{ border: "1.5px solid var(--ink)", background: "transparent" }} /> Average
            </span>
          </div>
          <svg viewBox={`0 0 ${size} ${size + 20}`} width="100%" height="auto" role="img" aria-label={`Spending by category, this ${range} versus average`}>
            {rings.map((r) => (
              <polygon
                key={r}
                points={radarPolygon(categories.map(() => 100 * r), cx, cy, radius)}
                fill="none"
                stroke="var(--line)"
                strokeWidth={1}
              />
            ))}
            {categories.map((_, i) => {
              const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
              const x = cx + radius * Math.cos(angle);
              const y = cy + radius * Math.sin(angle);
              return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" strokeWidth={1} />;
            })}
            <polygon points={thisMonthPts} fill="var(--lime)" fillOpacity={0.85} stroke="var(--lime-deep)" strokeWidth={1.5} />
            <polygon points={averagePts} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
            {categories.map((c, i) => {
              const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
              const lx = cx + (radius + 24) * Math.cos(angle);
              const ly = cy + (radius + 20) * Math.sin(angle);
              const anchor = Math.cos(angle) > 0.3 ? "start" : Math.cos(angle) < -0.3 ? "end" : "middle";
              return (
                <text key={c.label} x={lx} y={ly} textAnchor={anchor} className="db-radar-label">
                  {c.label}
                </text>
              );
            })}
          </svg>
        </>
      )}

      {range === "day" && (
        <>
          {dayLoading && <p className="db-empty-note">Loading today's spending…</p>}
          {!dayLoading && dayError && <div className="db-form-error">{dayError}</div>}
          {!dayLoading && !dayError && hourly && hourly.every((v) => v === 0) && (
            <p className="db-empty-note">No spending recorded today.</p>
          )}
          {!dayLoading && !dayError && hourly && !hourly.every((v) => v === 0) && (
            <HourlyBarChart hours={hourly} />
          )}
        </>
      )}
    </div>
  );
}

function CreditCardWidget({
  card,
  onAddCard,
}: {
  card: CardSummary | null;
  onAddCard: () => void;
}) {
  if (!card) {
    return (
      <div className="db-card">
        <p className="db-empty-note">You don't have a card yet.</p>
        <button type="button" className="db-add-card-btn" onClick={onAddCard}>
          <PlusIcon /> Add new card
        </button>
      </div>
    );
  }

  return (
    <div className="db-card">
      <div className="db-card-stack">
        <div className="db-visual-card">
          <div className="db-visual-card__chip" />
          <p className="db-visual-card__name">{card.holderCardName}</p>
          <div className="db-visual-card__balance">
            ${Math.trunc(card.balance)}<small>.{(card.balance % 1).toFixed(2).slice(2)}</small>
          </div>
          <div className="db-visual-card__foot">
            <span>*{card.last4} {card.expiry}</span>
            <span>{card.network}</span>
          </div>
        </div>
      </div>
      <div className="db-card-meta">
        <div className="db-card-meta__row">
          <span className="db-card-meta__label">Credit limit</span>
          <span className="db-card-meta__value">${card.creditLimit.toLocaleString()}</span>
        </div>
        <div className="db-card-meta__row">
          <span className="db-card-meta__label">Credit used</span>
          <span className="db-card-meta__value">${card.creditUsed.toFixed(2)}</span>
        </div>
        <div className="db-card-meta__row">
          <span className="db-card-meta__label">Currency</span>
          <span className="db-card-meta__value">{card.currency}</span>
        </div>
      </div>
      <button type="button" className="db-add-card-btn" onClick={onAddCard}>
        <PlusIcon /> Add new card
      </button>
    </div>
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
      <div className="db-card">
        <div className="db-budget-head">
          <h3 className="db-card__title">Budget</h3>
        </div>
        <p className="db-empty-note">Not enough data yet to chart spending over time.</p>
      </div>
    );
  }

  const highlightIndex = Math.min(3, coords.length - 1);
  const highlight = coords[highlightIndex];
  const path = smoothPath(coords);

  return (
    <div className="db-card">
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
    </div>
  );
}

function PromoCard({ onLearnMore }: { onLearnMore: () => void }) {
  return (
    <div className="db-promo">
      <h3 className="db-promo__heading">
        How to reduce expenses by <span className="db-promo__pill">25%</span>?
      </h3>
      <p className="db-promo__body">
        See where your money actually goes and get a few quick wins for trimming your monthly spend.
      </p>
      <div className="db-promo__art">
        <svg width="140" height="120" viewBox="0 0 140 120" aria-hidden="true" fill="none" stroke="var(--ink)" strokeWidth="2">
          <ellipse cx="98" cy="82" rx="26" ry="18" />
          <circle cx="82" cy="70" r="3" fill="var(--ink)" stroke="none" />
          <path d="M118 80c6-2 10 4 6 8" />
          <path d="M100 64c2-6 8-8 10-4" />
          <rect x="20" y="86" width="34" height="10" rx="2" />
          <rect x="24" y="76" width="26" height="10" rx="2" />
          <rect x="28" y="66" width="18" height="10" rx="2" />
          <circle cx="37" cy="60" r="8" />
        </svg>
      </div>
      <button type="button" className="db-promo__cta" onClick={onLearnMore}>
        Learn more
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   PAGE
   ────────────────────────────────────────────────────────────────────── */
type LoadStatus = "loading" | "ready" | "error";
type OpenModal = "addCard" | "addTransaction" | "allTransactions" | "profile" | "savingsTips" | null;

export default function Dashboard() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

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

  function handleCardCreated(card: CardSummary) {
    setData((prev) => (prev ? { ...prev, card } : prev));
  }

  function handleTransactionCreated(tx: Transaction, updatedCard: CardSummary | null) {
    setData((prev) => {
      if (!prev) return prev;
      // Prepend to the (already card-scoped) recent list.
      const transactions = [tx, ...prev.transactions];
      // Prefer the card the backend returned inline with the transaction —
      // it's the real post-transaction balance/creditUsed, not an estimate.
      const card = updatedCard ?? prev.card;
      return { ...prev, transactions, card };
    });
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
            <button className="db-pill-select" type="button">Financial <ChevronDown /></button>
            <button className="db-icon-btn" type="button" aria-label="Notifications">
              <BellIcon /><span className="db-dot" />
            </button>
            <button className="db-icon-btn" type="button" aria-label="Messages"><InboxIcon /></button>
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
                transactions={data.transactions}
                cardLast4={data.card?.last4 ?? null}
                onViewAll={() => setOpenModal("allTransactions")}
                onAddTransaction={() => setOpenModal("addTransaction")}
              />
              <CreditCardWidget card={data.card} onAddCard={() => setOpenModal("addCard")} />
            </div>

            <div className="db-grid__col2">
              <SpendingCard categories={data.spending} />
              <BudgetCard points={data.budget} />
            </div>

            <div className="db-grid__promo">
              <PromoCard onLearnMore={() => setOpenModal("savingsTips")} />
            </div>
          </div>
        )}
      </main>

      {openModal === "addCard" && (
        <AddCardModal onClose={() => setOpenModal(null)} onCreated={handleCardCreated} />
      )}
      {openModal === "addTransaction" && (
        <AddTransactionModal
          card={data?.card ?? null}
          onClose={() => setOpenModal(null)}
          onCreated={handleTransactionCreated}
        />
      )}
      {openModal === "allTransactions" && (
        <AllTransactionsModal
          cardId={data?.card?.id ?? null}
          cardName={data?.card?.holderCardName ?? null}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "profile" && data && (
        <ProfileModal user={data.user} onClose={() => setOpenModal(null)} />
      )}
      {openModal === "savingsTips" && (
        <Modal title="Ways to cut expenses" onClose={() => setOpenModal(null)} size="sm">
          <ul className="db-tips-list">
            <li>Review subscriptions in your Spending breakdown and cancel what you don't use.</li>
            <li>Set a weekly budget alert so overspending gets caught early, not at month end.</li>
            <li>Compare this month's category totals against your average to spot new habits.</li>
          </ul>
        </Modal>
      )}
    </div>
  );
}