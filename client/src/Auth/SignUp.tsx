import { useState, type FormEvent, type ReactNode } from "react";
import {
  GoogleOAuthProvider,
  GoogleLogin,
  type CredentialResponse,
} from "@react-oauth/google";
import { signup } from "./Assets";

/* ──────────────── STYLES (inlined, no separate CSS file) ──────────────── */
const styles = `
@import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;800&display=swap");

.sw-page {
  --lime: #c6ee4a;
  --lime-deep: #8fbf1f;
  --ink: #0a0a0a;
  --muted: #6b716a;
  --line: #dfe3d8;
  --panel: #f8faf4;
  --bg: #eef2e4;    
  --danger: #c0392b;

  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 40px;
  padding: 32px 24px;
  background: var(--bg);
  font-family: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--ink);
  box-sizing: border-box;
  position: relative;
}
.sw-page *, .sw-page *::before, .sw-page *::after { box-sizing: border-box; }

/* ── card ── */
.sw-card {
  width: 100%; max-width: 908px;
  display: grid; grid-template-columns: 1fr 1fr;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 28px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(60, 80, 20, 0.08);
}

/* ── left hero ── */
.sw-hero {
  background: var(--panel);
  padding: 40px 36px 0;
  display: flex; flex-direction: column;
  border-right: 1px solid var(--line);
}
.sw-brand { display: flex; align-items: center; gap: 12px; font-size: 28px; font-weight: 600; letter-spacing: -0.02em; }
.sw-hero h1 { margin: 40px 0 16px; font-size: 38px; line-height: 1.1; font-weight: 800; letter-spacing: -0.03em; }
.sw-hero p { margin: 0; max-width: 300px; color: var(--muted); font-size: 16px; line-height: 1.55; }
.sw-art { margin-top: auto; padding: 16px 16px 68px; }
.sw-art img { width: 140%; max-width: 320px; height: auto; display: block; }

/* ── right form ── */
.sw-form { padding: 40px 36px 28px; }
.sw-form h2 { margin: 0; font-size: 36px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; }
.sw-sub { margin: 6px 0 26px; color: var(--muted); font-size: 17px; }

.sw-field { margin-bottom: 16px; }
.sw-field label { display: block; margin-bottom: 8px; font-size: 14px; font-weight: 500; }

.sw-input {
  display: flex; align-items: center; gap: 10px;
  height: 46px; padding: 0 16px;
  border: 1px solid #cfd4c8; border-radius: 999px;
  background: #fff;
  transition: border-color .15s, box-shadow .15s;
}
.sw-input:focus-within { border-color: var(--lime-deep); box-shadow: 0 0 0 3px rgba(198, 238, 74, 0.45); }
.sw-input.has-error { border-color: var(--danger); }
.sw-input__icon { display: grid; place-items: center; color: var(--ink); }
.sw-input input {
  flex: 1; min-width: 0; border: 0; outline: 0; background: transparent;
  font: inherit; font-size: 14px; color: var(--ink);
}
.sw-input input::placeholder { color: #a3a8a0; }
.sw-input__toggle {
  border: 0; background: none; padding: 4px; cursor: pointer; color: var(--ink);
  display: grid; place-items: center; border-radius: 50%;
}
.sw-input__toggle:focus-visible { outline: 2px solid var(--ink); }

.sw-error { margin: 6px 0 0 16px; font-size: 12.5px; color: var(--danger); }
.sw-error--form { margin: 0 0 12px; text-align: center; }

/* ── buttons ── */
.sw-btn {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; height: 46px; border-radius: 999px;
  font: inherit; font-size: 15px; font-weight: 600;
  cursor: pointer; text-decoration: none;
  transition: transform .1s, opacity .15s, background .15s;
}
.sw-btn:active { transform: translateY(1px); }
.sw-btn--primary { margin-top: 8px; background: #000; color: #fff; border: 0; }
.sw-btn--primary:hover { background: #222; }
.sw-btn--primary:disabled { opacity: .6; cursor: not-allowed; }
.sw-btn--ghost { background: #fff; color: var(--ink); border: 1px solid #cfd4c8; font-weight: 500; }
.sw-btn--ghost:hover { background: #f6f8f2; }
.sw-btn--ghost:disabled { opacity: .6; cursor: not-allowed; }
.sw-btn:focus-visible { outline: 3px solid var(--lime-deep); outline-offset: 2px; }

.sw-divider { display: flex; align-items: center; gap: 12px; margin: 16px 0; color: var(--muted); font-size: 12px; }
.sw-divider::before, .sw-divider::after { content: ""; flex: 1; height: 1px; background: var(--line); }

.sw-foot { margin: 18px 0 0; text-align: center; font-size: 13px; color: var(--muted); }
.sw-foot a { color: var(--lime-deep); font-weight: 600; text-decoration: none; margin-left: 4px; }
.sw-foot a:hover { text-decoration: underline; }

.sw-google-wrap { width: 100%; }
.sw-google-wrap > div { width: 100% !important; }
.sw-google-loading { margin: 8px 0 0; text-align: center; font-size: 12.5px; color: var(--muted); }

/* ── responsive ── */
@media (max-width: 960px) {
  .sw-page { padding: 24px 16px; }
}
@media (max-width: 720px) {
  .sw-card { grid-template-columns: 1fr; }
  .sw-hero { border-right: 0; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
  .sw-art { display: none; }
  .sw-hero h1 { font-size: 30px; margin-top: 24px; }
  .sw-form h2 { font-size: 30px; }
}
`;

/* ──────────────── CONFIG (replace these with your real values) ──────────────── */
const API_BASE_URL = "http://localhost:5000/api/v1"; // e.g. import.meta.env.VITE_API_URL
const SIGNUP_ENDPOINT = "/auth/signup"; // POST { full_name, email, password }
const GOOGLE_AUTH_ENDPOINT = "/auth/google"; // POST { idToken }
const SIGN_IN_PATH = "/login"; // where "Sign in" link goes
const REDIRECT_AFTER_SIGNUP = "/dashboard";
// Piggy-bank illustration, embedded as a base64 data URI so the file is self-contained.


// REQUIRED: your Google OAuth Web Client ID from Google Cloud Console
// (APIs & Services → Credentials → OAuth 2.0 Client IDs). This is what was
// missing — GoogleLogin cannot render/authenticate without a provider that
// has a real client ID, and it throws on mount if there's no provider at all.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
/* ───────────────────────────────────────────────────────────── */

interface SignUpPayload {
  full_name: string;
  email: string;
  password: string;
}

interface FormErrors {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  form?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

function validate(v: { fullName: string; email: string; password: string; confirmPassword: string }): FormErrors {
  const e: FormErrors = {};
  if (!v.fullName.trim()) e.fullName = "Enter your full name.";
  if (!EMAIL_RE.test(v.email)) e.email = "Enter a valid email address.";
  if (!PASSWORD_RE.test(v.password)) {
    e.password = "Password must be at least 8 characters and include a letter and a number.";
  }
  if (v.confirmPassword !== v.password) e.confirmPassword = "Passwords don't match.";
  return e;
}

interface AuthSuccess {
  accessToken: string;
}

async function signUpRequest(payload: SignUpPayload): Promise<AuthSuccess> {
  const res = await fetch(`${API_BASE_URL}${SIGNUP_ENDPOINT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // required so the refreshToken cookie is set
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok || !body.success) {
    throw new Error(body.message ?? "Couldn't create your account. Try again.");
  }

  return { accessToken: body.data.accessToken };
}

// idToken here is a Google ID token (JWT), verified server-side via
// OAuth2Client.verifyIdToken in authService.googleAuth — NOT an access token.
async function googleAuthRequest(idToken: string): Promise<AuthSuccess> {
  const res = await fetch(`${API_BASE_URL}${GOOGLE_AUTH_ENDPOINT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ idToken }),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok || !body.success) {
    throw new Error(body.message ?? "Google sign-in failed. Please try again.");
  }

  return { accessToken: body.data.accessToken };
}

/* ───────────── small icon helpers ───────────── */
const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const UserIcon = () => <Svg><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" /></Svg>;
const MailIcon = () => <Svg><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></Svg>;
const LockIcon = () => <Svg><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>;
const EyeIcon = ({ off }: { off: boolean }) => (
  <Svg>
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
    <circle cx="12" cy="12" r="2.5" />
    {off && <path d="M4 4l16 16" />}
  </Svg>
);
const Logo = ({ size = 40 }: { size?: number }) => (
  <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
    <circle cx="24" cy="24" r="18" fill="none" stroke="#c6ee4a" strokeWidth="5"
      strokeLinecap="round" strokeDasharray="20 6" />
  </svg>
);

/* ───────────── field component ───────────── */
interface FieldProps {
  id: string;
  label: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  icon: ReactNode;
  error?: string;
  autoComplete?: string;
  toggle?: boolean;
}

function Field({ id, label, type = "text", placeholder, value, onChange, icon, error, autoComplete, toggle }: FieldProps) {
  const [visible, setVisible] = useState(false);
  const inputType = toggle ? (visible ? "text" : "password") : type;
  return (
    <div className="sw-field">
      <label htmlFor={id}>{label}</label>
      <div className={`sw-input ${error ? "has-error" : ""}`}>
        <span className="sw-input__icon">{icon}</span>
        <input
          id={id}
          type={inputType}
          placeholder={placeholder}
          value={value}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {toggle && (
          <button type="button" className="sw-input__toggle"
            aria-label={visible ? "Hide password" : "Show password"}
            onClick={() => setVisible((s) => !s)}>
            <EyeIcon off={!visible} />
          </button>
        )}
      </div>
      {error && <p id={`${id}-err`} className="sw-error" role="alert">{error}</p>}
    </div>
  );
}

/* ───────────── inner form (needs GoogleOAuthProvider above it) ───────────── */
function SignUpForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    const found = validate({ fullName, email, password, confirmPassword });
    setErrors(found);
    if (Object.keys(found).length) return;

    setLoading(true);
    try {
      const { accessToken } = await signUpRequest({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
      });
      // store however you manage auth state — sessionStorage/context/etc.
      sessionStorage.setItem("accessToken", accessToken);
      window.location.assign(REDIRECT_AFTER_SIGNUP);
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setLoading(false);
    }
  };

  // Your backend verifies a Google ID token via OAuth2Client.verifyIdToken,
  // so we need Google's ID-token flow. The GoogleLogin component provides
  // that as `credential` (a JWT), unlike useGoogleLogin's default implicit
  // flow which only returns an OAuth access token.
  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    setErrors({});
    const idToken = credentialResponse.credential;
    if (!idToken) {
      setErrors({ form: "Google sign-in failed. Please try again." });
      return;
    }
    setGoogleLoading(true);
    try {
      const { accessToken } = await googleAuthRequest(idToken);
      sessionStorage.setItem("accessToken", accessToken);
      window.location.assign(REDIRECT_AFTER_SIGNUP);
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="sw-page">
      <style>{styles}</style>

      <main className="sw-card">
        <section className="sw-hero">
          <div className="sw-brand"><Logo /><span>ExpenseMate</span></div>
          <h1>Take control<br />of your finances.</h1>
          <p>Track your spending, set your goals, and build a healthier financial future, all in one place.</p>
          <div className="sw-art">
            <img src={signup} alt="" />
          </div>
        </section>

        <section className="sw-form">
          <h2>Create your account</h2>
          <p className="sw-sub">Get started in just a few steps</p>

          <form onSubmit={handleSubmit} noValidate>
            <Field id="fullName" label="Full name" placeholder="Enter your full name" autoComplete="name"
              value={fullName} onChange={setFullName} icon={<UserIcon />} error={errors.fullName} />
            <Field id="email" label="Email address" type="email" placeholder="you@example.com" autoComplete="email"
              value={email} onChange={setEmail} icon={<MailIcon />} error={errors.email} />
            <Field id="password" label="Password" toggle placeholder="Create a strong password" autoComplete="new-password"
              value={password} onChange={setPassword} icon={<LockIcon />} error={errors.password} />
            <Field id="confirmPassword" label="Confirm password" toggle placeholder="Re-enter your password" autoComplete="new-password"
              value={confirmPassword} onChange={setConfirmPassword} icon={<LockIcon />} error={errors.confirmPassword} />

            {errors.form && <p className="sw-error sw-error--form" role="alert">{errors.form}</p>}

            <button type="submit" className="sw-btn sw-btn--primary" disabled={loading}>
              {loading ? "Creating account…" : "Sign up"}
            </button>
          </form>

          <div className="sw-divider"><span>or</span></div>

          <div className="sw-google-wrap">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setErrors({ form: "Google sign-in failed. Please try again." })}
              theme="outline"
              shape="pill"
              width="100%"
              text="signup_with"
            />
            {googleLoading && <p className="sw-google-loading">Connecting…</p>}
          </div>

          <p className="sw-foot">
            Already have an account? <a href={SIGN_IN_PATH}>Sign in</a>
          </p>
        </section>
      </main>
    </div>
  );
}

/* ───────────── page (exported) ───────────── */
// GoogleLogin only works inside a GoogleOAuthProvider — this was the missing
// piece causing the blank page. If you already wrap your whole app with
// GoogleOAuthProvider higher up (e.g. in main.tsx / App.tsx), you can drop
// this wrapper here and just export SignUpForm directly instead.
export default function SignUp() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <SignUpForm />
    </GoogleOAuthProvider>
  );
}