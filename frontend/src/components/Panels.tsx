import type { ReactNode } from "react";
import { CountUp, Sparkline } from "./Charts";
import { Icon, type IconName } from "./Icons";

export function PageHead({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  actions?: ReactNode;
}) {
  return (
    <section className="page-head hud rise">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </section>
  );
}

export type Tone = "signal" | "crit" | "high" | "ok" | "violet";

export function Kpi({
  label,
  value,
  loading,
  icon,
  tone = "signal",
  hint,
  spark,
  share,
  index = 0,
}: {
  label: string;
  value: number;
  loading?: boolean;
  icon: IconName;
  tone?: Tone;
  hint?: string;
  spark?: number[];
  share?: number;
  index?: number;
}) {
  return (
    <section className="kpi hud rise" data-tone={tone} style={{ ["--i" as string]: index }}>
      <div className="kpi-top">
        <span className="kpi-icon">
          <Icon name={icon} size={17} />
        </span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">
        <CountUp value={value} loading={loading} />
      </div>
      <div className="kpi-foot">
        {spark ? (
          <Sparkline values={spark} color={`var(--${tone === "signal" ? "signal" : tone})`} />
        ) : share !== undefined ? (
          <div className="kpi-bar">
            <span style={{ width: `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%` }} />
          </div>
        ) : null}
        {hint && <small>{hint}</small>}
      </div>
    </section>
  );
}

export function Card({
  title,
  sub,
  action,
  children,
  className = "",
  index = 0,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  index?: number;
}) {
  return (
    <section className={`card rise ${className}`} style={{ ["--i" as string]: index }}>
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {sub && <p className="muted small">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name="inbox" size={26} />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

export function RefreshButton({
  onClick,
  loading,
  label = "Refresh",
}: {
  onClick: () => void;
  loading: boolean;
  label?: string;
}) {
  return (
    <button type="button" className="btn btn-ghost" onClick={onClick} disabled={loading}>
      <span className={loading ? "spin" : undefined}>
        <Icon name="refresh" size={16} />
      </span>
      {loading ? "Refreshing…" : label}
    </button>
  );
}

export const PRIORITY_COLORS: Record<string, string> = {
  p1: "var(--crit)",
  p2: "var(--high)",
  p3: "var(--med)",
  p4: "var(--low)",
};

export const statusColor = (status: string) => `var(--st-${status})`;
