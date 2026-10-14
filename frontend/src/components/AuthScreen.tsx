import type { FormEvent } from "react";
import type { AuthMode } from "../types";
import { Icon } from "./Icons";
import { LensMark, Wordmark } from "./Brand";

type Props = {
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  fullName: string;
  setFullName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (fn: (v: boolean) => boolean) => void;
  submitting: boolean;
  error: string;
  setError: (v: string) => void;
  apiStatus: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function Radar() {
  return (
    <div className="radar" aria-hidden="true">
      <svg viewBox="0 0 320 320">
        <defs>
          <radialGradient id="rg" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#36e2ff" stopOpacity=".28" />
            <stop offset="1" stopColor="#36e2ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#36e2ff" stopOpacity="0" />
            <stop offset="1" stopColor="#36e2ff" stopOpacity=".55" />
          </linearGradient>
        </defs>
        <circle cx="160" cy="160" r="150" fill="url(#rg)" />
        {[150, 110, 70, 30].map((r) => (
          <circle key={r} cx="160" cy="160" r={r} fill="none" stroke="#36e2ff" strokeOpacity=".22" strokeDasharray={r === 150 ? "0" : "2 5"} />
        ))}
        <path d="M160 10v300M10 160h300" stroke="#36e2ff" strokeOpacity=".16" />
        <g className="radar-sweep">
          <path d="M160 160 L160 10 A150 150 0 0 1 266 54 Z" fill="url(#sweep)" />
          <line x1="160" y1="160" x2="160" y2="10" stroke="#36e2ff" strokeWidth="1.5" />
        </g>
        <circle cx="160" cy="160" r="4" fill="#36e2ff" />
        <g className="blip b1"><circle cx="232" cy="104" r="4" fill="#ff4560" /><circle cx="232" cy="104" r="4" className="blip-ring" /></g>
        <g className="blip b2"><circle cx="98" cy="214" r="3.5" fill="#ffc83d" /><circle cx="98" cy="214" r="3.5" className="blip-ring" /></g>
        <g className="blip b3"><circle cx="205" cy="226" r="3" fill="#2fe6a0" /><circle cx="205" cy="226" r="3" className="blip-ring" /></g>
      </svg>
    </div>
  );
}

export function AuthScreen(p: Props) {
  const login = p.mode === "login";
  return (
    <main className="auth auth-yellow">
      <section className="auth-intro">
        <header className="brand">
          <LensMark size={40} />
          <Wordmark size={22} />
        </header>

        <div className="auth-hero">
          <div className="eyebrow">
            <span className="live-dot" /> UNIFIED SECURITY OPERATIONS
          </div>
          <h1>
            See threats
            <br />
            <span className="grad">before they</span>
            <br />
            become incidents.
          </h1>
          <p className="lead">
            One platform to analyze threats, prioritize incidents, and coordinate a smarter human-led security response.
          </p>
          <ol className="features">
            <li>
              <span>01</span>
              <div>
                <strong>AI-assisted threat analysis</strong>
                <p>Turn suspicious activity into actionable intelligence.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Unified incident management</strong>
                <p>Track investigations from submission to resolution.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Human-led decisions</strong>
                <p>Keep analysts in control of every critical decision.</p>
              </div>
            </li>
          </ol>
        </div>
        <Radar />

        <div className="auth-intro-foot">
          <span className="live-dot" />
          {p.apiStatus}
          <i>/</i>
          DEVELOPMENT ENVIRONMENT
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="mobile-brand brand">
            <LensMark size={34} />
            <Wordmark size={19} />
          </div>

          <div className="auth-heading">
            <span className="eyebrow">{login ? "WELCOME BACK" : "GET STARTED"}</span>
            <h2>{login ? "Sign in to your workspace" : "Create your account"}</h2>
            <p>
              {login
                ? "Enter your credentials to continue to ThreatLens AI."
                : "Create a client account to get started with ThreatLens AI."}
            </p>
          </div>

          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={login} className={login ? "tab active" : "tab"} onClick={() => { p.setMode("login"); p.setError(""); }} type="button">
              Sign in
            </button>
            <button role="tab" aria-selected={!login} className={!login ? "tab active" : "tab"} onClick={() => { p.setMode("register"); p.setError(""); }} type="button">
              Create account
            </button>
          </div>

          {p.error && (
            <div className="alert bad" role="alert">
              <Icon name="alert" />
              <span>{p.error}</span>
            </div>
          )}

          <form className="form" onSubmit={p.onSubmit}>
            {!login && (
              <label className="field">
                <span>Full name</span>
                <input type="text" autoComplete="name" placeholder="Your full name" value={p.fullName} onChange={(e) => p.setFullName(e.target.value)} minLength={2} maxLength={120} required />
              </label>
            )}
            <label className="field">
              <span>Email address</span>
              <input type="email" autoComplete="email" placeholder="you@company.com" value={p.email} onChange={(e) => p.setEmail(e.target.value)} required />
            </label>
            <label className="field">
              <span>Password</span>
              <div className="pw">
                <input
                  type={p.showPassword ? "text" : "password"}
                  autoComplete={login ? "current-password" : "new-password"}
                  placeholder={login ? "Enter your password" : "At least 8 characters"}
                  value={p.password}
                  onChange={(e) => p.setPassword(e.target.value)}
                  minLength={!login ? 8 : undefined}
                  maxLength={128}
                  required
                />
                <button type="button" onClick={() => p.setShowPassword((v) => !v)} aria-label={p.showPassword ? "Hide password" : "Show password"}>
                  {p.showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <button className="btn btn-primary btn-lg btn-block" disabled={p.submitting}>
              {p.submitting ? (
                <>
                  <span className="spinner" />
                  {login ? "Signing in..." : "Creating account..."}
                </>
              ) : (
                <>
                  {login ? "Sign in to ThreatLens" : "Create client account"}
                  <Icon name="arrow" size={17} />
                </>
              )}
            </button>
          </form>

          <p className="secure-note">
            <Icon name="shield" size={14} /> Protected access · Role-based authorization
          </p>

          <div className="switch">
            {login ? (
              <>
                New to ThreatLens AI?{" "}
                <button type="button" onClick={() => { p.setMode("register"); p.setError(""); }}>
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => { p.setMode("login"); p.setError(""); }}>
                  Sign in
                </button>
              </>
            )}
          </div>

          <p className="fineprint">
            ThreatLens AI is under active development. AI threat analysis and incident workflows are being built incrementally.
          </p>
        </div>

        <div className="auth-bottom">
          <span>© 2026 ThreatLens AI</span>
          <span>SECURITY OPERATIONS PLATFORM</span>
        </div>
      </section>
    </main>
  );
}
