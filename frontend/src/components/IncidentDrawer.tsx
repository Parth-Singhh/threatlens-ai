import { useEffect, useRef, type FormEvent } from "react";
import { PRIORITIES, incidentTypes, type IncidentPriority } from "../types";
import { Icon } from "./Icons";

export function IncidentDrawer({
  open,
  onClose,
  onSubmit,
  submitting,
  type,
  setType,
  priority,
  setPriority,
  title,
  setTitle,
  description,
  setDescription,
  evidence,
  setEvidence,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  type: string;
  setType: (v: string) => void;
  priority: IncidentPriority;
  setPriority: (v: IncidentPriority) => void;
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  evidence: string;
  setEvidence: (v: string) => void;
}) {
  const first = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    first.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="drawer-root">
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header className="drawer-head">
          <div>
            <div className="eyebrow">NEW INCIDENT REPORT</div>
            <h2 id="drawer-title">Report a security incident</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cancel and close">
            <Icon name="x" />
          </button>
        </header>

        <p className="muted drawer-lead">
          Describe what happened and choose the initial urgency based on observed impact. An analyst may revise it after review. Do not include passwords, access tokens, or other secrets in your report.
        </p>

        <form onSubmit={onSubmit} className="form drawer-form">
          <label className="field">
            <span>Incident type</span>
            <select ref={first} value={type} onChange={(event) => setType(event.target.value)}>
              {incidentTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="field prio-set" aria-describedby="client-priority-help">
            <legend>Initial priority (your assessment)</legend>
            <div className="prio-grid">
              {PRIORITIES.map((item) => (
                <label key={item.value} className="prio-card" data-p={item.value}>
                  <input
                    type="radio"
                    name="incident-priority"
                    value={item.value}
                    checked={priority === item.value}
                    onChange={() => setPriority(item.value)}
                  />
                  <span className="prio-body">
                    <b>
                      {item.value.toUpperCase()} · {item.label}
                    </b>
                    <small>{item.blurb}</small>
                  </span>
                </label>
              ))}
            </div>
            <span id="client-priority-help" className="help">
              Choose the urgency based on what you observed. An analyst may revise the priority after review.
            </span>
          </fieldset>

          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={160} placeholder="e.g. Suspicious payroll email" required />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              minLength={10}
              maxLength={5000}
              rows={7}
              placeholder="Explain what you noticed, where it appeared, and why it seems suspicious."
              required
            />
            <em className="counter">{description.length} / 5000</em>
          </label>

          <label className="field">
            <span>Evidence reference (optional)</span>
            <input value={evidence} onChange={(event) => setEvidence(event.target.value)} maxLength={1000} placeholder="A safe reference or URL; file uploads are not enabled yet" />
          </label>

          <div className="drawer-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary btn-lg" type="submit" disabled={submitting}>
              {submitting ? (<><span className="spinner" /> Submitting…</>) : "Submit incident"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
