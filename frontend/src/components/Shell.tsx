import { useEffect, useState, type ReactNode } from "react";
import type { User, View } from "../types";
import { Icon, type IconName } from "./Icons";
import { LensMark, Wordmark } from "./Brand";

export type NavItem = { id: View; label: string; icon: IconName; badge?: number };

function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span className="utc" title="Coordinated Universal Time">
      <Icon name="clock" size={14} />
      {now.toISOString().slice(11, 19)} <em>UTC</em>
    </span>
  );
}

function apiTone(status: string) {
  if (/operational/i.test(status)) return "ok";
  if (/unavailable|attention/i.test(status)) return "bad";
  return "wait";
}

export function Shell({
  user,
  nav,
  view,
  onView,
  title,
  eyebrow,
  apiStatus,
  onSignOut,
  onReport,
  children,
}: {
  user: User;
  nav: NavItem[];
  view: View;
  onView: (view: View) => void;
  title: string;
  eyebrow: string;
  apiStatus: string;
  onSignOut: () => void;
  onReport?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const initials = user.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="app light-theme">
      <div className={open ? "scrim show" : "scrim"} onClick={() => setOpen(false)} />
      <aside className={open ? "sidebar open" : "sidebar"} aria-label="Primary">
        <a className="brand" href="/" aria-label="ThreatLens AI home">
          <LensMark size={36} />
          <Wordmark size={19} />
        </a>

        <div className="ws-chip">
          <span className="live-dot" />
          SECURITY OPERATIONS CENTER
        </div>

        {onReport && (
          <button type="button" className="btn btn-primary btn-block" onClick={() => { setOpen(false); onReport(); }}>
            <Icon name="plus" size={16} /> Report an incident
          </button>
        )}

        <nav className="nav">
          <span className="nav-label">Workspace</span>
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? "nav-item active" : "nav-item"}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => {
                onView(item.id);
                setOpen(false);
              }}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.badge ? <b className="nav-badge">{item.badge}</b> : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className={`api-pill ${apiTone(apiStatus)}`}>
            <span className="live-dot" />
            <div>
              <small>PLATFORM STATUS</small>
              <span>{apiStatus}</span>
            </div>
          </div>
          <p className="tagline">Intelligence. Visibility. Response.</p>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Icon name="menu" />
          </button>
          <div className="crumbs">
            <span>{eyebrow}</span>
            <i>/</i>
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <UtcClock />
            <div className="user-chip">
              <span className="avatar">{initials || "U"}</span>
              <div>
                <strong>{user.full_name}</strong>
                <small>{user.role}</small>
              </div>
            </div>
            <button className="btn btn-ghost" onClick={onSignOut} type="button">
              <Icon name="logout" size={16} /> <span className="hide-sm">Sign out</span>
            </button>
          </div>
        </header>
        <main className="content" key={view}>
          {children}
        </main>
        <footer className="foot">
          <span>THREATLENS AI · {apiStatus}</span>
          <span>Intelligence. Visibility. Response.</span>
        </footer>
      </div>
    </div>
  );
}

export function Toasts({
  success,
  error,
  onDismissSuccess,
  onDismissError,
}: {
  success: string;
  error: string;
  onDismissSuccess: () => void;
  onDismissError: () => void;
}) {
  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(onDismissSuccess, 7000);
    return () => window.clearTimeout(timer);
  }, [success, onDismissSuccess]);

  return (
    <div className="toasts">
      {success && (
        <div className="toast ok" role="status">
          <Icon name="check" />
          <span>{success}</span>
          <button type="button" onClick={onDismissSuccess} aria-label="Dismiss notification">
            <Icon name="x" size={15} />
          </button>
        </div>
      )}
      {error && (
        <div className="toast bad" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
          <button type="button" onClick={onDismissError} aria-label="Dismiss error">
            <Icon name="x" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
