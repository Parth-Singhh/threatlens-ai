import { Fragment, useMemo, useState } from "react";
import {
  PRIORITIES,
  STATUSES,
  incidentTypes,
  type Incident,
  type View,
} from "../types";
import { CLOSED_STATUSES, dailyCounts, isOpen, relativeTime, safeHref, titleCase } from "../lib";
import { AreaTrend, BarList, Donut } from "./Charts";
import { PriorityBadge, StatusBadge } from "./Badges";
import { Icon } from "./Icons";
import { Card, EmptyState, Kpi, PRIORITY_COLORS, PageHead, RefreshButton, statusColor } from "./Panels";

const typeLabel = (value: string) =>
  incidentTypes.find((item) => item.value === value)?.label ?? value;

export function ClientOverview({
  incidents,
  loading,
  onReport,
  onNavigate,
}: {
  incidents: Incident[];
  loading: boolean;
  onReport: () => void;
  onNavigate: (view: View) => void;
}) {
  const stats = useMemo(() => {
    const open = incidents.filter(isOpen).length;
    const critical = incidents.filter((i) => i.priority === "p1").length;
    const resolved = incidents.filter((i) => CLOSED_STATUSES.includes(i.status)).length;
    return { open, critical, resolved, daily: dailyCounts(incidents) };
  }, [incidents]);
  const total = incidents.length;
  const recent = [...incidents]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, 5);

  return (
    <>
      <PageHead
        eyebrow="CLIENT WORKSPACE"
        title="Security overview"
        sub="Report suspicious activity and track your security incidents."
        actions={
          <button className="btn btn-primary btn-lg" type="button" onClick={onReport}>
            <Icon name="plus" size={17} /> Report an incident
          </button>
        }
      />

      <div className="kpi-grid k4">
        <Kpi index={0} label="Total incidents" value={total} loading={loading} icon="layers" spark={stats.daily.values} hint="14-day intake" />
        <Kpi index={1} label="Open incidents" value={stats.open} loading={loading} icon="activity" tone="violet" share={total ? stats.open / total : 0} hint={`${total ? Math.round((stats.open / total) * 100) : 0}% of total`} />
        <Kpi index={2} label="Critical priority" value={stats.critical} loading={loading} icon="flame" tone="crit" share={total ? stats.critical / total : 0} hint="P1 · all time" />
        <Kpi index={3} label="Resolved / closed" value={stats.resolved} loading={loading} icon="check" tone="ok" share={total ? stats.resolved / total : 0} hint={`${total ? Math.round((stats.resolved / total) * 100) : 0}% of total`} />
      </div>

      <div className="grid g-2-1">
        <Card index={4} title="Incident volume" sub="Reports submitted over the last 14 days">
          <AreaTrend values={stats.daily.values} labels={stats.daily.labels} />
        </Card>
        <Card index={5} title="Priority mix" sub="All of your incidents">
          <Donut
            centerValue={total}
            centerLabel="incidents"
            segments={PRIORITIES.map((p) => ({
              label: `${p.value.toUpperCase()} · ${p.label}`,
              value: incidents.filter((i) => i.priority === p.value).length,
              color: PRIORITY_COLORS[p.value],
            }))}
          />
        </Card>
      </div>

      <div className="grid g-1-1">
        <Card index={6} title="Status pipeline" sub="Where your incidents sit in the response lifecycle">
          <BarList
            empty="Incidents will appear here once reported"
            items={STATUSES.map((s) => ({
              label: titleCase(s),
              value: incidents.filter((i) => i.status === s).length,
              color: statusColor(s),
            }))}
          />
        </Card>
        <Card
          index={7}
          title="Recent incidents"
          sub="Latest reports from your workspace"
          action={
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => onNavigate("incidents")}>
              View all <Icon name="arrow" size={14} />
            </button>
          }
        >
          {recent.length === 0 ? (
            <EmptyState title="No incidents yet" text="Use “Report an incident” to submit your first report." />
          ) : (
            <ul className="recent">
              {recent.map((incident) => (
                <li key={incident.id}>
                  <PriorityBadge priority={incident.priority} />
                  <div>
                    <strong>
                      #{incident.id} · {incident.title}
                    </strong>
                    <small>
                      {typeLabel(incident.incident_type)} · {relativeTime(incident.created_at)}
                    </small>
                  </div>
                  <StatusBadge status={incident.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section className="cta hud rise" style={{ ["--i" as string]: 8 }}>
        <div>
          <div className="eyebrow amber">EXPERIMENTAL AI TOOL</div>
          <h2>Check a suspicious link</h2>
          <p>Run a URL through the ThreatLens URL model before you report it. Experimental — results always need human review.</p>
        </div>
        <button className="btn btn-ghost btn-lg" type="button" onClick={() => onNavigate("analyzer")}>
          <Icon name="scan" size={17} /> Open URL analyzer
        </button>
      </section>

      <p className="page-note">
        Clients provide an initial priority; analysts can revise it during triage. Threat category remains a backend default, and evidence file uploads are not implemented yet.
      </p>
    </>
  );
}

type Scope = "all" | "open" | "closed";

export function ClientIncidents({
  incidents,
  loading,
  onRefresh,
  onReport,
}: {
  incidents: Incident[];
  loading: boolean;
  onRefresh: () => void;
  onReport: () => void;
}) {
  const [scope, setScope] = useState<Scope>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return incidents.filter((incident) => {
      if (scope === "open" && !isOpen(incident)) return false;
      if (scope === "closed" && isOpen(incident)) return false;
      return (
        !q ||
        [incident.title, incident.description, incident.incident_type, String(incident.id)].some((v) =>
          v.toLowerCase().includes(q),
        )
      );
    });
  }, [incidents, scope, search]);

  return (
    <>
      <PageHead
        eyebrow="CLIENT WORKSPACE"
        title="My incidents"
        sub="Live data from the ThreatLens API"
        actions={
          <>
            <RefreshButton onClick={onRefresh} loading={loading} />
            <button className="btn btn-primary" type="button" onClick={onReport}>
              <Icon name="plus" size={16} /> Report an incident
            </button>
          </>
        }
      />

      <section className="card rise">
        <div className="toolbar">
          <div className="seg" role="group" aria-label="Filter incidents">
            {(["all", "open", "closed"] as Scope[]).map((s) => (
              <button key={s} type="button" className={scope === s ? "active" : ""} onClick={() => setScope(s)}>
                {s === "all" ? "All" : s === "open" ? "Open" : "Resolved / closed"}
              </button>
            ))}
          </div>
          <div className="input-icon search">
            <Icon name="search" size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, description, ID…" aria-label="Search incidents" />
          </div>
        </div>

        {loading && incidents.length === 0 ? (
          <div className="skeletons">
            {[0, 1, 2, 3].map((n) => <div key={n} className="skel" />)}
          </div>
        ) : incidents.length === 0 ? (
          <EmptyState title="No incidents yet" text="Use “Report an incident” to submit your first report." />
        ) : rows.length === 0 ? (
          <EmptyState title="No matching incidents" text="Try changing the search or filter." />
        ) : (
          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  {["Incident", "Type", "Priority", "Status", "Created"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((incident) => {
                  const isOpenRow = expanded === incident.id;
                  const href = safeHref(incident.evidence_reference);
                  return (
                    <Fragment key={incident.id}>
                      <tr className={isOpenRow ? "row open" : "row"} onClick={() => setExpanded(isOpenRow ? null : incident.id)}>
                        <td data-label="Incident" className="cell-main">
                          <button type="button" className="row-toggle" aria-expanded={isOpenRow} aria-label={`Toggle details for incident ${incident.id}`}>
                            <Icon name="chevron" size={16} />
                          </button>
                          <div>
                            <strong>
                              <span className="mono id">#{incident.id}</span> {incident.title}
                            </strong>
                            <p className="clamp">{incident.description}</p>
                          </div>
                        </td>
                        <td data-label="Type" className="nowrap">{typeLabel(incident.incident_type)}</td>
                        <td data-label="Priority"><PriorityBadge priority={incident.priority} long /></td>
                        <td data-label="Status"><StatusBadge status={incident.status} /></td>
                        <td data-label="Created" className="nowrap dim">{new Date(incident.created_at).toLocaleDateString()}</td>
                      </tr>
                      {isOpenRow && (
                        <tr className="detail-row">
                          <td colSpan={5}>
                            <div className="detail">
                              <div>
                                <small>DESCRIPTION</small>
                                <p className="prewrap">{incident.description}</p>
                              </div>
                              <div>
                                <small>EVIDENCE REFERENCE</small>
                                <p className="break">
                                  {incident.evidence_reference ? (
                                    href ? <a href={href} target="_blank" rel="noreferrer">{incident.evidence_reference}</a> : incident.evidence_reference
                                  ) : "None provided"}
                                </p>
                                <small>TIMELINE</small>
                                <p className="dim small">
                                  Created {new Date(incident.created_at).toLocaleString()} · Updated {new Date(incident.updated_at).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
