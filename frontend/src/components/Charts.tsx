import { useEffect, useId, useRef, useState } from "react";

export function CountUp({ value, loading }: { value: number; loading?: boolean }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - t0) / 700);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(start + (value - start) * eased);
      from.current = next;
      setShown(next);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{loading ? "—" : shown}</>;
}

export function Sparkline({ values, color = "var(--signal)" }: { values: number[]; color?: string }) {
  const W = 120;
  const H = 34;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [
    (i / Math.max(1, values.length - 1)) * W,
    H - 3 - (v / max) * (H - 8),
  ]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sparkline" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={color} opacity=".12" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function AreaTrend({
  values,
  labels,
  height = 210,
  unit = "incidents",
}: {
  values: number[];
  labels: string[];
  height?: number;
  unit?: string;
}) {
  const W = 640;
  const H = height;
  const L = 30;
  const R = 12;
  const T = 14;
  const B = 26;
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const n = values.length;
  const peak = Math.max(0, ...values);
  const max = Math.max(4, Math.ceil(peak / 4) * 4);
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);

  let line = `M${x(0)} ${y(values[0] ?? 0)}`;
  for (let i = 1; i < n; i += 1) {
    const mid = (x(i - 1) + x(i)) / 2;
    line += ` C${mid} ${y(values[i - 1])}, ${mid} ${y(values[i])}, ${x(i)} ${y(values[i])}`;
  }
  const area = `${line} L${x(n - 1)} ${H - B} L${x(0)} ${H - B} Z`;
  const total = values.reduce((a, b) => a + b, 0);

  function onMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((px - L) / (W - L - R)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, idx)));
  }

  return (
    <div
      className="area-wrap"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
      role="img"
      aria-label={`${total} ${unit} over the last ${n} days`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="area-svg">
        <defs>
          <linearGradient id={`a${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#36e2ff" stopOpacity=".38" />
            <stop offset="1" stopColor="#7a5cff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`s${gid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7a5cff" />
            <stop offset="1" stopColor="#36e2ff" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((tick) => {
          const v = (max / 4) * tick;
          return (
            <g key={tick}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid-line" />
              <text x={L - 8} y={y(v) + 3.5} textAnchor="end" className="axis-text">
                {v}
              </text>
            </g>
          );
        })}
        {labels.map((label, i) =>
          (n - 1 - i) % 4 === 0 ? (
            <text key={label + i} x={x(i)} y={H - 6} textAnchor="middle" className="axis-text">
              {label}
            </text>
          ) : null,
        )}
        <path d={area} fill={`url(#a${gid})`} className="area-fill" />
        <path d={line} fill="none" stroke={`url(#s${gid})`} strokeWidth="2.4" strokeLinecap="round" pathLength={1} className="area-line" />
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="cross-line" />
            <circle cx={x(hover)} cy={y(values[hover])} r="5" className="cross-dot" />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="chart-tip"
          style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(values[hover]) / H) * 100}%` }}
        >
          <strong>{values[hover]}</strong> {unit}
          <span>{labels[hover]}</span>
        </div>
      )}
    </div>
  );
}

export type Segment = { label: string; value: number; color: string };

export function Donut({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: Segment[];
  centerValue: number;
  centerLabel: string;
}) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const live = segments.filter((s) => s.value > 0);
  let acc = 0;
  return (
    <div className="donut">
      <div className="donut-chart">
        <svg viewBox="0 0 140 140" role="img" aria-label={`${centerLabel}: ${centerValue}`}>
          <circle cx="70" cy="70" r={R} className="donut-track" />
          {total > 0 &&
            live.map((segment) => {
              const len = (segment.value / total) * C;
              const dash = Math.max(0, len - (live.length > 1 ? 3 : 0));
              const offset = -acc;
              acc += len;
              return (
                <circle
                  key={segment.label}
                  cx="70"
                  cy="70"
                  r={R}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="13"
                  strokeLinecap="butt"
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={offset}
                  transform="rotate(-90 70 70)"
                  className="donut-seg"
                />
              );
            })}
        </svg>
        <div className="donut-center">
          <strong>
            <CountUp value={centerValue} />
          </strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul className="legend">
        {segments.map((segment) => (
          <li key={segment.label}>
            <i style={{ background: segment.color }} />
            <span>{segment.label}</span>
            <b>{segment.value}</b>
            <em>{total ? Math.round((segment.value / total) * 100) : 0}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarList({
  items,
  empty = "No data yet",
}: {
  items: { label: string; value: number; color?: string }[];
  empty?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length || items.every((i) => i.value === 0)) {
    return <p className="chart-empty">{empty}</p>;
  }
  return (
    <ul className="barlist">
      {items.map((item, index) => (
        <li key={item.label}>
          <div className="barlist-head">
            <span>{item.label}</span>
            <b>{item.value}</b>
          </div>
          <div className="barlist-track">
            <span
              style={{
                width: `${(item.value / max) * 100}%`,
                background: item.color ?? "linear-gradient(90deg, #7a5cff, #36e2ff)",
                animationDelay: `${index * 60}ms`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Gauge({ value, label, caption }: { value: number; label: string; caption: string }) {
  const len = Math.PI * 90;
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 70 ? "var(--crit)" : pct >= 40 ? "var(--high)" : pct >= 15 ? "var(--med)" : "var(--ok)";
  return (
    <div className="gauge">
      <svg viewBox="0 0 200 118" role="img" aria-label={`${label}: ${pct} of 100`}>
        <path d="M10 104 A90 90 0 0 1 190 104" className="gauge-track" />
        <path
          d="M10 104 A90 90 0 0 1 190 104"
          className="gauge-fill"
          style={{ stroke: color, strokeDasharray: `${(pct / 100) * len} ${len}` }}
        />
        {[0, 25, 50, 75, 100].map((t) => {
          const a = Math.PI - (t / 100) * Math.PI;
          return (
            <line
              key={t}
              x1={100 + Math.cos(a) * 76}
              y1={104 - Math.sin(a) * 76}
              x2={100 + Math.cos(a) * 70}
              y2={104 - Math.sin(a) * 70}
              className="gauge-tick"
            />
          );
        })}
      </svg>
      <div className="gauge-readout">
        <strong style={{ color }}>
          <CountUp value={pct} />
        </strong>
        <span>{label}</span>
      </div>
      <p className="gauge-caption">{caption}</p>
    </div>
  );
}
