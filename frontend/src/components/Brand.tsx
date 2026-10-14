import { useId } from "react";

export function LensMark({ size = 34 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="lens-mark" aria-hidden="true">
      <defs>
        <linearGradient id={`lg${id}`} x1="0" y1="0" x2="40" y2="40">
          <stop offset="0" stopColor="#ffd84d" />
          <stop offset="1" stopColor="#f4b400" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="11" fill="#07101c" stroke={`url(#lg${id})`} strokeWidth="1.4" />
      <circle cx="20" cy="20" r="10.5" fill="none" stroke={`url(#lg${id})`} strokeWidth="2" />
      <circle cx="20" cy="20" r="5" fill="none" stroke="#ffd84d" strokeOpacity=".55" strokeWidth="1.2" />
      <path d="M20 4v6M20 30v6M4 20h6M30 20h6" stroke="#ffd84d" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="20" cy="20" r="2.2" fill="#ffd84d" />
    </svg>
  );
}

export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      Threat<b>Lens</b>
      <span className="wordmark-ai">AI</span>
    </span>
  );
}

export function LoadingScreen() {
  return (
    <main className="loading-screen">
      <div className="loading-lens">
        <LensMark size={64} />
        <span className="ring r1" />
        <span className="ring r2" />
      </div>
      <p>Initializing ThreatLens AI...</p>
    </main>
  );
}
