import { useMemo, useState, type ReactNode } from "react";

/* ──────────────────────────────────────────────────────────────────────
   PLACEHOLDER DATA
   Everything below marked PLACEHOLDER is mock data shaped the way the
   real API responses probably will be. Replace each block with a fetch /
   react-query / swr call once the endpoints exist — the shapes are the
   contract to build your backend against.
   ────────────────────────────────────────────────────────────────────── */

interface Transaction {
  id: string;
  merchant: string;
  date: string; // pre-formatted, e.g. "8 July · 11:55 AM"
  amount: number; // negative = money out
  badge: "paypal" | "twitch" | "airbnb" | "dribbble" | "other";
}

// PLACEHOLDER — GET /api/v1/transactions?limit=5
const PLACEHOLDER_TRANSACTIONS: Transaction[] = [
  { id: "t1", merchant: "Paypal", date: "8 July · 11:55 AM", amount: -10.67, badge: "paypal" },
  { id: "t2", merchant: "Twitch", date: "7 July · 7:50 PM", amount: -12.01, badge: "twitch" },
  { id: "t3", merchant: "Airbnb", date: "6 July · 11:17 AM", amount: -112.43, badge: "airbnb" },
  { id: "t4", merchant: "Dribbble", date: "6 July · 09:35 AM", amount: -16.0, badge: "dribbble" },
  { id: "t5", merchant: "Airbnb", date: "6 July · 11:17 AM", amount: -112.43, badge: "airbnb" },
];

interface SpendingCategory {
  label: string;
  thisMonth: number; // 0–100 scale
  average: number; // 0–100 scale
}

// PLACEHOLDER — GET /api/v1/spending/by-category?period=this_month
const PLACEHOLDER_SPENDING: SpendingCategory[] = [
  { label: "Food", thisMonth: 90, average: 68 },
  { label: "Bills", thisMonth: 62, average: 74 },
  { label: "Sporting goods", thisMonth: 48, average: 40 },
  { label: "Home goods", thisMonth: 70, average: 55 },
  { label: "Clothing", thisMonth: 55, average: 62 },
  { label: "Other", thisMonth: 66, average: 50 },
];

interface QuickContact {
  id: string;
  initials: string;
  color: string;
}

// PLACEHOLDER — GET /api/v1/contacts/frequent
const PLACEHOLDER_CONTACTS: QuickContact[] = [
  { id: "c1", initials: "AK", color: "#111111" },
  { id: "c2", initials: "MR", color: "#f0a3b1" },
  { id: "c3", initials: "JD", color: "#c9c9c9" },
  { id: "c4", initials: "SL", color: "#e8b64a" },
];

interface CardSummary {
  planName: string; // small preview card peeking above, e.g. "Platina"
  planBalance: number;
  holderCardName: string; // e.g. "Universal"
  balance: number;
  last4: string;
  expiry: string;
  network: string; // "VISA" | "MASTERCARD" | ...
  creditLimit: number;
  creditUsed: number;
  currency: string;
}

// PLACEHOLDER — GET /api/v1/cards/primary
const PLACEHOLDER_CARD: CardSummary = {
  planName: "Platina",
  planBalance: 500.25,
  holderCardName: "Universal",
  balance: 8523.2,
  last4: "9423",
  expiry: "06/28",
  network: "VISA",
  creditLimit: 22000,
  creditUsed: 0,
  currency: "USD",
};

interface BudgetPoint {
  label: string; // x-axis tick, e.g. "18 dec"
  value: number; // dollars
}

// PLACEHOLDER — GET /api/v1/budget/timeline?range=6w
const PLACEHOLDER_BUDGET: BudgetPoint[] = [
  { label: "18 dec", value: 900 },
  { label: "25 dec", value: 6200 },
  { label: "1 jan", value: 1800 },
  { label: "8 jan", value: 5400 },
  { label: "15 jan", value: 6800 },
  { label: "22 jan", value: 3600 },
  { label: "29 jan", value: 6400 },
];

// PLACEHOLDER — GET /api/v1/me
const PLACEHOLDER_USER = {
  name: "Joseph Mitchell",
  initials: "JM",
};

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
}
.db-page *, .db-page *::before, .db-page *::after { box-sizing: border-box; }

/* ── sidebar ── */
.db-sidebar {
  width: 68px;
  flex-shrink: 0;
  background: var(--ink);
  border-radius: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
  gap: 4px;
}
.db-sidebar__logo { margin-bottom: 24px; }
.db-sidebar__spacer { flex: 1; }
.db-nav-btn {
  width: 44px; height: 44px;
  display: grid; place-items: center;
  border: 0; border-radius: 14px;
  background: transparent; color: #8b8f86;
  cursor: pointer;
}
.db-nav-btn:hover { color: #fff; }
.db-nav-btn.active { background: #1c1c1c; color: var(--lime); }
.db-nav-btn:focus-visible { outline: 2px solid var(--lime); outline-offset: 2px; }

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
.db-user { display: flex; align-items: center; gap: 10px; margin-left: 4px; }
.db-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  background: var(--ink); color: #fff;
  display: grid; place-items: center; font-size: 13px; font-weight: 600;
}
.db-user__name { font-size: 14px; font-weight: 600; }

/* ── grid ── */
.db-grid {
  display: grid;
  grid-template-columns: 1.15fr 1.25fr 0.82fr;
  gap: 16px;
  align-items: start;
}

.db-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 24px;
  padding: 22px;
}
.db-card__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.db-card__title { font-size: 16px; font-weight: 700; margin: 0; }

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

/* ── spending / legend ── */
.db-legend { display: flex; align-items: center; gap: 14px; font-size: 12.5px; color: var(--muted); }
.db-legend__item { display: flex; align-items: center; gap: 6px; }
.db-legend__swatch { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.db-radar-label { font-size: 11.5px; fill: var(--muted); font-family: inherit; }

/* ── quick transfer ── */
.db-avatars { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.db-avatar-sm { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-size: 12px; font-weight: 700; flex-shrink: 0; }
.db-avatar-add {
  width: 38px; height: 38px; border-radius: 50%;
  border: 1.5px dashed #c7cbbe; background: transparent;
  display: grid; place-items: center; color: var(--muted); cursor: pointer;
}
.db-amount-input {
  width: 100%; height: 46px; border-radius: 14px;
  border: 1px solid var(--line); background: #f7f8f3;
  padding: 0 16px; font: inherit; font-size: 15px; color: var(--ink);
  margin-bottom: 12px;
}
.db-amount-input:focus { outline: 2px solid var(--lime-deep); }
.db-send-btn {
  width: 100%; height: 46px; border-radius: 999px; border: 0;
  background: var(--ink); color: #fff; font: inherit; font-size: 14px; font-weight: 600;
  cursor: pointer;
}
.db-send-btn:hover { background: #222; }

/* ── credit card widget ── */
.db-card-stack { position: relative; margin-bottom: 26px; }
.db-card-peek {
  position: absolute; top: -14px; left: 14px; right: 14px;
  height: 34px; border-radius: 16px 16px 0 0;
  background: #d7dbcd; display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px; font-size: 12px; font-weight: 600; color: #5c6154;
}
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

/* ── budget chart ── */
.db-budget-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.db-tooltip-bubble { fill: var(--ink); }
.db-tooltip-text { fill: #fff; font-size: 12px; font-weight: 700; font-family: inherit; }
.db-axis-label { font-size: 11px; fill: var(--muted); font-family: inherit; }

/* ── promo card ── */
.db-promo {
  background: var(--lime);
  border-radius: 24px;
  padding: 26px 24px;
  display: flex; flex-direction: column;
  min-height: 300px;
}
.db-promo__heading { font-size: 30px; font-weight: 800; line-height: 1.08; letter-spacing: -0.02em; margin: 0; }
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

@media (max-width: 1100px) {
  .db-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 760px) {
  .db-page { flex-direction: column; }
  .db-sidebar { width: 100%; flex-direction: row; border-radius: 20px; padding: 10px; }
  .db-sidebar__spacer { display: none; }
  .db-grid { grid-template-columns: 1fr; }
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
const HomeIcon = () => <Svg><path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" /></Svg>;
const GridIcon = () => <Svg><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></Svg>;
const WalletIcon = () => <Svg><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><circle cx="16" cy="14.5" r="1.2" fill="currentColor" stroke="none" /></Svg>;
const InboxIcon = () => <Svg><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></Svg>;
const ChatIcon = () => <Svg><path d="M4 5h16v11H8l-4 4V5Z" /></Svg>;
const CheckCircleIcon = () => <Svg><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.3 2.3L16 10" /></Svg>;
const HelpIcon = () => <Svg><circle cx="12" cy="12" r="9" /><path d="M9.5 9.3a2.5 2.5 0 1 1 3.7 2.2c-.9.5-1.2 1-1.2 2" /><path d="M12 17h.01" /></Svg>;
const GearIcon = () => <Svg><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" /></Svg>;
const BellIcon = () => <Svg><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 19a2 2 0 0 0 4 0" /></Svg>;
const ChevronDown = () => <Svg size={14}><path d="m6 9 6 6 6-6" /></Svg>;
const ArrowRight = () => <Svg size={13}><path d="m9 6 6 6-6 6" /></Svg>;
const PlusIcon = () => <Svg size={16}><path d="M12 5v14M5 12h14" /></Svg>;

const Logo = ({ size = 34 }: { size?: number }) => (
  <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
    <circle cx="24" cy="24" r="18" fill="none" stroke="#c6ee4a" strokeWidth="5"
      strokeLinecap="round" strokeDasharray="20 6" />
  </svg>
);

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
   CARDS
   ────────────────────────────────────────────────────────────────────── */
function TransactionsCard({ transactions }: { transactions: Transaction[] }) {
  return (
    <div className="db-card">
      <div className="db-card__head">
        <h3 className="db-card__title">Recent transactions</h3>
        <button className="db-view-all" type="button">View all <ArrowRight /></button>
      </div>
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
    </div>
  );
}

function SpendingCard({ categories }: { categories: SpendingCategory[] }) {
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
        <div className="db-legend">
          <span className="db-legend__item">
            <span className="db-legend__swatch" style={{ background: "var(--lime)" }} /> This month
          </span>
          <span className="db-legend__item">
            <span className="db-legend__swatch" style={{ border: "1.5px solid var(--ink)", background: "transparent" }} /> Average
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${size} ${size + 20}`} width="100%" height="auto" role="img" aria-label="Spending by category, this month versus average">
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
    </div>
  );
}

function QuickTransferCard({ contacts }: { contacts: QuickContact[] }) {
  const [amount, setAmount] = useState("1000");
  return (
    <div className="db-card">
      <div className="db-card__head" style={{ marginBottom: 14 }}>
        <h3 className="db-card__title">Quick transfer</h3>
      </div>
      <div className="db-avatars">
        {contacts.map((c) => (
          <span key={c.id} className="db-avatar-sm" style={{ background: c.color }}>{c.initials}</span>
        ))}
        <button type="button" className="db-avatar-add" aria-label="Add contact"><PlusIcon /></button>
      </div>
      <input
        className="db-amount-input"
        inputMode="decimal"
        value={`$ ${amount}`}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        aria-label="Transfer amount"
      />
      <button type="button" className="db-send-btn">Send</button>
    </div>
  );
}

function CreditCardWidget({ card }: { card: CardSummary }) {
  return (
    <div className="db-card">
      <div className="db-card-stack">
        <div className="db-card-peek">
          <span>{card.planName}</span>
          <span>${card.planBalance.toFixed(2)}</span>
        </div>
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
      <button type="button" className="db-add-card-btn"><PlusIcon /> Add new card</button>
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

  const max = 7000;
  const yTicks = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000];

  const coords = useMemo(
    () =>
      points.map((p, i) => ({
        x: padL + (i / (points.length - 1)) * chartW,
        y: padT + chartH - (Math.min(p.value, max) / max) * chartH,
        ...p,
      })),
    [points]
  );

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
              <text x={4} y={y + 4} className="db-axis-label">{t === 0 ? "0" : `${t / 1000}k`}</text>
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

function PromoCard() {
  return (
    <div className="db-promo">
      <h3 className="db-promo__heading">
        How to reduce expenses by <span className="db-promo__pill">25%</span>?
      </h3>
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
      <button type="button" className="db-promo__cta">Learn more</button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   PAGE
   ────────────────────────────────────────────────────────────────────── */
export default function Dashboard() {
  // TODO: replace each PLACEHOLDER_* constant with real data, e.g.:
  // const { data: transactions } = useQuery(["transactions"], fetchTransactions);
  const transactions = PLACEHOLDER_TRANSACTIONS;
  const spending = PLACEHOLDER_SPENDING;
  const contacts = PLACEHOLDER_CONTACTS;
  const card = PLACEHOLDER_CARD;
  const budget = PLACEHOLDER_BUDGET;
  const user = PLACEHOLDER_USER;

  return (
    <div className="db-page">
      <style>{styles}</style>

      <aside className="db-sidebar">
        <div className="db-sidebar__logo"><Logo /></div>
        <button className="db-nav-btn" type="button" aria-label="Home"><HomeIcon /></button>
        <button className="db-nav-btn active" type="button" aria-label="Dashboard"><GridIcon /></button>
        <button className="db-nav-btn" type="button" aria-label="Wallet"><WalletIcon /></button>
        <button className="db-nav-btn" type="button" aria-label="Inbox"><InboxIcon /></button>
        <button className="db-nav-btn" type="button" aria-label="Messages"><ChatIcon /></button>
        <button className="db-nav-btn" type="button" aria-label="Approvals"><CheckCircleIcon /></button>
        <div className="db-sidebar__spacer" />
        <button className="db-nav-btn" type="button" aria-label="Help"><HelpIcon /></button>
        <button className="db-nav-btn" type="button" aria-label="Settings"><GearIcon /></button>
      </aside>

      <main className="db-main">
        <header className="db-header">
          <h1 className="db-title">Dashboard</h1>
          <div className="db-header__right">
            <button className="db-pill-select" type="button">Financial <ChevronDown /></button>
            <button className="db-icon-btn" type="button" aria-label="Notifications">
              <BellIcon /><span className="db-dot" />
            </button>
            <button className="db-icon-btn" type="button" aria-label="Messages"><InboxIcon /></button>
            <div className="db-user">
              <span className="db-avatar">{user.initials}</span>
              <span className="db-user__name">{user.name}</span>
            </div>
          </div>
        </header>

        <div className="db-grid">
          <TransactionsCard transactions={transactions} />
          <SpendingCard categories={spending} />
          <QuickTransferCard contacts={contacts} />

          <CreditCardWidget card={card} />
          <BudgetCard points={budget} />
          <PromoCard />
        </div>
      </main>
    </div>
  );
}