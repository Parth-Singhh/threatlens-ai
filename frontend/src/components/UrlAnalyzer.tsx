import type { FormEvent } from "react";
import type { UrlAnalysisResponse } from "../types";
import { Icon } from "./Icons";

function ScoreScale({ score, low, high }: { score: number; low: number; high: number }) {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return (
    <div className="scale" aria-label={`Raw model score ${(score * 100).toFixed(2)} percent`}>
      <div className="scale-track">
        <span className="zone low" style={{ width: `${clamp(low) * 100}%` }} />
        <span className="zone mid" style={{ width: `${clamp(high - low) * 100}%` }} />
        <span className="zone high" style={{ width: `${clamp(1 - high) * 100}%` }} />
        <span className="needle" style={{ left: `${clamp(score) * 100}%` }}>
          <b>{(score * 100).toFixed(1)}%</b>
        </span>
      </div>
      <div className="scale-ticks">
        <span style={{ left: 0 }}>0%</span>
        <span style={{ left: `${clamp(low) * 100}%` }}>{(low * 100).toFixed(0)}%</span>
        <span style={{ left: `${clamp(high) * 100}%` }}>{(high * 100).toFixed(0)}%</span>
        <span style={{ left: "100%" }}>100%</span>
      </div>
      <div className="scale-key">
        <span><i className="low" /> Low-score label</span>
        <span><i className="mid" /> Uncertain</span>
        <span><i className="high" /> Flagged for phishing review</span>
      </div>
    </div>
  );
}

export function UrlAnalyzer({
  url,
  setUrl,
  analysis,
  loading,
  error,
  onSubmit,
  onUseInIncident,
}: {
  url: string;
  setUrl: (v: string) => void;
  analysis: UrlAnalysisResponse | null;
  loading: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** Provided only for roles that can file incident reports. */
  onUseInIncident?: () => void;
}) {
  const tone =
    analysis?.prediction === "phishing"
      ? "bad"
      : analysis?.prediction === "uncertain"
        ? "warn"
        : "ok";
  const riskTone =
    analysis?.risk_level === "high"
      ? "bad"
      : analysis?.risk_level === "medium"
        ? "high"
        : analysis?.risk_level === "low"
          ? "ok"
          : "warn";

  return (
    <section className="card analyzer">
      <div className="card-head wrap">
        <div>
          <div className="eyebrow amber">EXPERIMENTAL AI TOOL</div>
          <h2>URL threat analysis</h2>
          <p className="muted">
            Analyze URL structure with the ThreatLens URL MLP. This tool inspects the submitted string only; it does not open or fetch the URL.
          </p>
        </div>
        <span className="tag warn">NOT VALIDATED FOR LIVE DECISIONS</span>
      </div>

      <div className="alert warn">
        <Icon name="alert" />
        <span>
          <strong>Important:</strong> Current testing showed false positives on several well-known legitimate domains. Treat this output as experimental evidence only—not a verdict that a URL is malicious or safe. Verify findings independently before taking action.
        </span>
      </div>

      <form onSubmit={onSubmit} className="analyzer-form">
        <label className="field grow">
          <span>URL to analyze</span>
          <div className="input-icon">
            <Icon name="link" size={16} />
            <input
              type="text"
              inputMode="url"
              autoComplete="url"
              maxLength={2048}
              placeholder="https://suspicious.example/path"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
              spellCheck={false}
            />
          </div>
        </label>
        <button type="submit" className="btn btn-primary btn-lg" disabled={loading || !url.trim()}>
          {loading ? (<><span className="spinner" /> Analyzing…</>) : (<><Icon name="scan" size={17} /> Analyze URL</>)}
        </button>
      </form>

      {error && (
        <div role="alert" className="alert bad">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      )}

      {loading && <div className="scanline" aria-hidden="true" />}

      {analysis && (
        <div className="result">
          <div className="result-top">
            <div className="result-url">
              <small>ANALYZED URL</small>
              <p>{analysis.url}</p>
              <span className="mono dim">Model: {analysis.model_name}</span>
            </div>
            <div className="chips">
              <span className={`chip ${tone}`}>Triage result: {analysis.prediction.replaceAll("_", " ").toUpperCase()}</span>
              <span className={`chip ${riskTone}`}>Risk label: {analysis.risk_level.toUpperCase()}</span>
            </div>
          </div>

          <div className="result-grid">
            <div className="stat">
              <small>Raw model phishing score</small>
              <strong className={tone}>{(analysis.phishing_probability * 100).toFixed(2)}%</strong>
              <span>Not a validated real-world probability</span>
            </div>
            <div className="stat">
              <small>High-score review cutoff</small>
              <strong>{(analysis.decision_threshold * 100).toFixed(0)}%</strong>
              <span>Validation-selected threshold; not a probability-calibration guarantee</span>
            </div>
          </div>

          <ScoreScale score={analysis.phishing_probability} low={analysis.low_score_threshold} high={analysis.decision_threshold} />

          <div className="alert warn compact">
            <Icon name="alert" size={16} />
            <span>
              {analysis.model_mode === "experimental-demo"
                ? "EXPERIMENTAL MODEL — not validated for operational decisions. "
                : "MODEL DECISION AID — analyst review is required. "}
              Scores ≥ {(analysis.decision_threshold * 100).toFixed(0)}% are flagged for phishing review; scores ≤ {(analysis.low_score_threshold * 100).toFixed(0)}% receive a low-score label; scores between those cutoffs are marked UNCERTAIN. A low score is not proof that a URL is safe.
            </span>
          </div>

          <div className="signals">
            <h3>Rule-based URL signals</h3>
            {analysis.signals.length ? (
              <ul>
                {analysis.signals.map((signal, index) => (
                  <li key={`${index}-${signal}`}>
                    <span className="mono">{String(index + 1).padStart(2, "0")}</span>
                    {signal}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No URL signals were returned.</p>
            )}
          </div>

          <details className="limits">
            <summary>Model evaluation & limitations</summary>
            <p>{analysis.explanation_note}</p>
          </details>

          {onUseInIncident && (
            <div className="result-actions">
              <button type="button" className="btn btn-primary" onClick={onUseInIncident}>
                <Icon name="plus" size={16} /> Use result in incident report
              </button>
              <span className="muted small">
                Opens a prefilled report for your review; nothing is submitted automatically.
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
