import { Fragment, useMemo, useState } from "react";
import {
  PRIORITIES,
  STATUSES,
  incidentTypes,
  type Incident,
  type IncidentPriority,
  type IncidentUpdatePayload,
  type QueueScope,
  type User,
  type View,
} from "../types";
import {
  CLOSED_STATUSES,
  IN_PROGRESS_STATUSES,
  PRIORITY_RANK,
  countBy,
  dailyCounts,
  isOpen,
  pressureIndex,
  relativeTime,
  safeHref,
  titleCase,
} from "../lib";
import { AreaTrend, BarList, Donut, Gauge } from "./Charts";
import { PriorityBadge, StatusBadge } from "./Badges";
import { Icon } from "./Icons";
import { Card, EmptyState, Kpi, PRIORITY_COLORS, PageHead, RefreshButton, statusColor } from "./Panels";

const typeLabel = (value: string) =>
  incidentTypes.find((item) => item.value === value)?.label ?? value.replaceAll("_", " ");

type UpdateFn = (id: number, changes: IncidentUpdatePayload) => void;

export function CommandCenter({
  user,
  incidents,
  loading,
  updatingId,
  onRefresh,
  onNavigate,
  onTriage,
  onUpdate,
}: {
  user: User;
  incidents: Incident[];
  loading: boolean;
  updatingId: number | null;
  onRefresh: () => void;
  onNavigate: (view: View) => void;
  onTriage: (scope: QueueScope, priority: string) => void;
  onUpdate: UpdateFn;
}) {
  const d = useMemo(() => {
    const open = incidents.filter(isOpen);
    const unassigned = open.filter((i) => i.assigned_analyst_id === null);
    const critOpen = open.filter((i) => i.priority === "p1");
    const critUnassigned = critOpen.filter((i) => i.assigned_analyst_id === null);
    const attention = [...unassigned]
      .sort(
        (a, b) =>
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          +new Date(a.created_at) - +new Date(b.created_at),
      )
      .slice(0, 6);
    return {
      open,
      unassigned: unassigned.length,
      critOpen: critOpen.length,
      critUnassigned: critUnassigned.length,
      inProgress: incidents.filter((i) => IN_PROGRESS_STATUSES.includes(i.status)).length,
      resolved: incidents.filter((i) => CLOSED_STATUSES.includes(i.status)).length,
      mine: incidents.filter((i) => i.assigned_analyst_id === user.id && isOpen(i)).length,
      escalated: incidents.filter((i) => i.status === "escalated").length,
      daily: dailyCounts(incidents),
      pressure: pressureIndex(incidents),
      categories: countBy(incidents, (i) => titleCase(i.threat_category)).slice(0, 6),
      types: countBy(incidents, (i) => typeLabel(i.incident_type)).slice(0, 6),
      attention,
    };
  }, [incidents, user.id]);

  const total = incidents.length;
  const isAnalyst = user.role === "analyst";

  return (
    <>
      <PageHead
        eyebrow={user.role === "admin" ? "ADMIN WORKSPACE" : "ANALYST WORKSPACE"}
        title="Command center"
        sub="Review client reports, take ownership, and track each investigation."
        actions={
          <>
            <RefreshButton onClick={onRefresh} loading={loading} label="Refresh queue" />
            <button className="btn btn-primary" type="button" onClick={() => onNavigate("incidents")}>
              <Icon name="list" size={16} /> Open queue
            </button>
          </>
        }
      />

      {d.critUnassigned > 0 && (
        <div className="siren rise" role="alert">
          <span className="siren-icon">
            <Icon name="alert" size={20} />
          </span>
          <div>
            <strong>
              {d.critUnassigned} critical (P1) incident{d.critUnassigned === 1 ? "" : "s"} awaiting an owner
            </strong>
            <p>Unassigned P1 work is the highest-risk item in the queue. Triage it first.</p>
          </div>
          <button className="btn btn-danger" type="button" onClick={() => onTriage("unassigned", "p1")}>
            Triage now <Icon name="arrow" size={15} />
          </button>
        </div>
      )}

      <div className="kpi-grid k6">
        <Kpi index={0} label="All incidents" value={total} loading={loading && !total} icon="layers" spark={d.daily.values} hint="14-day intake" />
        <Kpi index={1} label="Unassigned" value={d.unassigned} loading={loading && !total} icon="inbox" tone="high" share={d.open.length ? d.unassigned / d.open.length : 0} hint="open & no owner" />
        <Kpi index={2} label="In progress" value={d.inProgress} loading={loading && !total} icon="activity" tone="violet" share={total ? d.inProgress / total : 0} hint="being worked" />
        <Kpi index={3} label="Critical open" value={d.critOpen} loading={loading && !total} icon="flame" tone="crit" share={d.open.length ? d.critOpen / d.open.length : 0} hint="P1 · not closed" />
        {isAnalyst ? (
          <Kpi index={4} label="Assigned to me" value={d.mine} loading={loading && !total} icon="user" tone="signal" share={d.open.length ? d.mine / d.open.length : 0} hint="your open work" />
        ) : (
          <Kpi index={4} label="Escalated" value={d.escalated} loading={loading && !total} icon="target" tone="signal" share={total ? d.escalated / total : 0} hint="needs senior eyes" />
        )}
        <Kpi index={5} label="Resolved / closed" value={d.resolved} loading={loading && !total} icon="check" tone="ok" share={total ? d.resolved / total : 0} hint={`${total ? Math.round((d.resolved / total) * 100) : 0}% closure rate`} />
      </div>

      <div className="grid g-2-1">
        <Card index={6} title="Incident intake" sub="Reports received over the last 14 days">
          <AreaTrend values={d.daily.values} labels={d.daily.labels} />
        </Card>
        <Card index={7} title="Queue pressure" sub="Open work, weighted by priority">
          <Gauge
            value={d.pressure}
            label="/ 100"
            caption="Computed from the loaded incidents: P1 22 · P2 9 · P3 3 · P4 1 per open item, +2 if unassigned."
          />
        </Card>
      </div>

      <div className="grid g-1-1-1">
        <Card index={8} title="Open by priority" sub="Not resolved or closed">
          <Donut
            centerValue={d.open.length}
            centerLabel="open"
            segments={PRIORITIES.map((p) => ({
              label: `${p.value.toUpperCase()} · ${p.label}`,
              value: d.open.filter((i) => i.priority === p.value).length,
              color: PRIORITY_COLORS[p.value],
            }))}
          />
        </Card>
        <Card index={9} title="Response pipeline" sub="Incidents by lifecycle status">
          <BarList
            empty="No incidents in the queue"
            items={STATUSES.map((s) => ({
              label: titleCase(s),
              value: incidents.filter((i) => i.status === s).length,
              color: statusColor(s),
            }))}
          />
        </Card>
        <Card index={10} title="Threat categories" sub="Backend-assigned category">
          <BarList empty="No incidents in the queue" items={d.categories.map(([label, value]) => ({ label, value }))} />
        </Card>
      </div>

      <div className="grid g-2-1">
        <Card
          index={11}
          title="Needs an owner"
          sub="Open, unassigned incidents — highest priority first"
          action={
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => onTriage("unassigned", "all")}>
              See all <Icon name="arrow" size={14} />
            </button>
          }
        >
          {d.attention.length === 0 ? (
            <EmptyState title="Queue is covered" text="Every open incident has an owner." />
          ) : (
            <ul className="attention">
              {d.attention.map((incident) => (
                <li key={incident.id}>
                  <PriorityBadge priority={incident.priority} />
                  <div>
                    <strong>
                      <span className="mono id">#{incident.id}</span> {incident.title}
                    </strong>
                    <small>
                      {typeLabel(incident.incident_type)} · reported {relativeTime(incident.created_at)}
                    </small>
                  </div>
                  {isAnalyst && (
                    <button
                      className="btn btn-primary btn-sm"
                      type="button"
                      disabled={updatingId === incident.id}
                      onClick={() => onUpdate(incident.id, { assigned_analyst_id: user.id })}
                    >
                      {updatingId === incident.id ? "Saving…" : "Assign to me"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card index={12} title="Incident types" sub="What clients are reporting">
          <BarList empty="No incidents in the queue" items={d.types.map(([label, value]) => ({ label, value }))} />
        </Card>
      </div>

      <p className="page-note">
        Analyst actions are saved through the API. URL analysis is an experimental aid and requires human review. Clients provide an initial priority; analysts can revise it during triage. Threat category remains a backend default, and evidence file uploads are not implemented yet.
      </p>
    </>
  );
}

type SortKey = "newest" | "oldest" | "priority" | "updated";

export function IncidentQueue({
  user,
  incidents,
  loading,
  updatingId,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  priorityFilter,
  setPriorityFilter,
  scope,
  setScope,
  onRefresh,
  onUpdate,
}: {
  user: User;
  incidents: Incident[];
  loading: boolean;
  updatingId: number | null;
  search: string;
  setSearch: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  priorityFilter: string;
  setPriorityFilter: (v: string) => void;
  scope: QueueScope;
  setScope: (v: QueueScope) => void;
  onRefresh: () => void;
  onUpdate: UpdateFn;
}) {
  const [sort, setSort] = useState<SortKey>("priority");
  const [expanded, setExpanded] = useState<number | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = incidents.filter((incident) => {
      const matchesSearch =
        !q ||
        [
          incident.title,
          incident.description,
          incident.incident_type,
          incident.threat_category,
          String(incident.id),
          String(incident.reporter_id),
          incident.evidence_reference ?? "",
        ].some((value) => value.toLowerCase().includes(q));
      const matchesStatus = statusFilter === "all" || incident.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || incident.priority === priorityFilter;
      const matchesScope =
        scope === "all" ||
        (scope === "open" && isOpen(incident)) ||
        (scope === "unassigned" && isOpen(incident) && incident.assigned_analyst_id === null) ||
        (scope === "mine" && incident.assigned_analyst_id === user.id);
      return matchesSearch && matchesStatus && matchesPriority && matchesScope;
    });
    return filtered.sort((a, b) => {
      if (sort === "oldest") return +new Date(a.created_at) - +new Date(b.created_at);
      if (sort === "updated") return +new Date(b.updated_at) - +new Date(a.updated_at);
      if (sort === "priority")
        return (
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          +new Date(b.created_at) - +new Date(a.created_at)
        );
      return +new Date(b.created_at) - +new Date(a.created_at);
    });
  }, [incidents, search, statusFilter, priorityFilter, scope, sort, user.id]);

  const scopes: { id: QueueScope; label: string; count: number }[] = [
    { id: "all", label: "All", count: incidents.length },
    { id: "open", label: "Open", count: incidents.filter(isOpen).length },
    { id: "unassigned", label: "Unassigned", count: incidents.filter((i) => isOpen(i) && i.assigned_analyst_id === null).length },
    { id: "mine", label: "Mine", count: incidents.filter((i) => i.assigned_analyst_id === user.id).length },
  ];
  const filtersActive = search || statusFilter !== "all" || priorityFilter !== "all" || scope !== "all";

  return (
    <>
      <PageHead
        eyebrow={user.role === "admin" ? "ADMIN WORKSPACE" : "ANALYST WORKSPACE"}
        title="Incident response queue"
        sub="Review client reports, take ownership, and track each investigation."
        actions={<RefreshButton onClick={onRefresh} loading={loading} label="Refresh queue" />}
      />

      <section className="card rise">
        <div className="card-head">
          <div>
            <h2>Find incidents</h2>
            <p className="muted small">
              Showing {rows.length} of {incidents.length} incidents. Filters run on the currently loaded queue.
            </p>
          </div>
          {filtersActive && (
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setPriorityFilter("all");
                setScope("all");
              }}
            >
              <Icon name="x" size={14} /> Clear filters
            </button>
          )}
        </div>

        <div className="seg wide" role="group" aria-label="Queue scope">
          {scopes.map((s) => (
            <button key={s.id} type="button" className={scope === s.id ? "active" : ""} onClick={() => setScope(s.id)}>
              {s.label} <b>{s.count}</b>
            </button>
          ))}
        </div>

        <div className="filters">
          <label className="field">
            <span>Search</span>
            <div className="input-icon">
              <Icon name="search" size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title, description, ID, reporter…" />
            </div>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Priority</span>
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="all">All priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.value.toUpperCase()} · {p.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Sort by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="priority">Priority (P1 first)</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="updated">Recently updated</option>
            </select>
          </label>
        </div>
      </section>

      <section className="card rise" style={{ ["--i" as string]: 1 }}>
        <div className="card-head">
          <div>
            <h2>All reported incidents</h2>
            <p className="muted small">Live records from the ThreatLens API</p>
          </div>
        </div>

        {loading && incidents.length === 0 ? (
          <div className="skeletons">
            {[0, 1, 2, 3, 4].map((n) => <div key={n} className="skel" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No matching incidents" text="Try changing the search or filters." />
        ) : (
          <div className="table-wrap">
            <table className="dtable queue">
              <thead>
                <tr>
                  {["Incident details", "Reporter / type", "Priority", "Status", "Assignment / actions"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((incident) => {
                  const isUpdating = updatingId === incident.id;
                  const isAssignedToMe = incident.assigned_analyst_id === user.id;
                  const isOpenRow = expanded === incident.id;
                  const href = safeHref(incident.evidence_reference);
                  return (
                    <Fragment key={incident.id}>
                      <tr className={isOpenRow ? "row open" : "row"} data-p={incident.priority}>
                        <td data-label="Incident details" className="cell-main">
                          <button
                            type="button"
                            className="row-toggle"
                            aria-expanded={isOpenRow}
                            aria-label={`Toggle details for incident ${incident.id}`}
                            onClick={() => setExpanded(isOpenRow ? null : incident.id)}
                          >
                            <Icon name="chevron" size={16} />
                          </button>
                          <div>
                            <strong>
                              <span className="mono id">#{incident.id}</span> {incident.title}
                            </strong>
                            <p className="clamp">{incident.description}</p>
                            <small className="dim">
                              Created {new Date(incident.created_at).toLocaleString()}
                            </small>
                          </div>
                        </td>
                        <td data-label="Reporter / type">
                          <div>Client #{incident.reporter_id}</div>
                          <div className="dim">{typeLabel(incident.incident_type)}</div>
                          <small className="mute">Category: {incident.threat_category.replaceAll("_", " ")}</small>
                        </td>
                        <td data-label="Priority">
                          <select
                            className="sel-prio"
                            data-p={incident.priority}
                            value={incident.priority}
                            disabled={isUpdating}
                            aria-label={`Priority for incident ${incident.id}`}
                            onChange={(event) =>
                              onUpdate(incident.id, { priority: event.target.value as IncidentPriority })
                            }
                          >
                            {PRIORITIES.map((p) => (
                              <option key={p.value} value={p.value}>{p.value.toUpperCase()} · {p.label}</option>
                            ))}
                          </select>
                          <small className="mute">Editable by analyst</small>
                        </td>
                        <td data-label="Status">
                          <select
                            className="sel-status"
                            data-s={incident.status}
                            value={incident.status}
                            disabled={isUpdating}
                            aria-label={`Status for incident ${incident.id}`}
                            onChange={(event) => {
                              const nextStatus = event.target.value as NonNullable<IncidentUpdatePayload["status"]>;
                              if (
                                nextStatus === "assigned" &&
                                incident.assigned_analyst_id === null &&
                                user.role === "analyst"
                              ) {
                                onUpdate(incident.id, { status: nextStatus, assigned_analyst_id: user.id });
                              } else {
                                onUpdate(incident.id, { status: nextStatus });
                              }
                            }}
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>{titleCase(s)}</option>
                            ))}
                          </select>
                          {isUpdating && <small className="saving">Saving…</small>}
                        </td>
                        <td data-label="Assignment / actions">
                          {incident.assigned_analyst_id === null ? (
                            <div className="assign warn">Unassigned</div>
                          ) : (
                            <div className={isAssignedToMe ? "assign ok" : "assign"}>
                              Analyst #{incident.assigned_analyst_id}
                              {isAssignedToMe ? " · You" : ""}
                            </div>
                          )}
                          {user.role === "analyst" && !isAssignedToMe && (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={isUpdating}
                              onClick={() => onUpdate(incident.id, { assigned_analyst_id: user.id })}
                            >
                              {isUpdating
                                ? "Saving…"
                                : incident.assigned_analyst_id === null
                                  ? "Assign to me"
                                  : "Reassign to me"}
                            </button>
                          )}
                          {user.role === "analyst" && isAssignedToMe && (
                            <span className="assigned-you"><Icon name="check" size={14} /> Assigned to you</span>
                          )}
                        </td>
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
                                <small>EVIDENCE</small>
                                <p className="break">
                                  {incident.evidence_reference ? (
                                    href ? <a href={href} target="_blank" rel="noreferrer">{incident.evidence_reference}</a> : incident.evidence_reference
                                  ) : "None provided"}
                                </p>
                                <small>TIMELINE</small>
                                <p className="dim small">
                                  Created {new Date(incident.created_at).toLocaleString()} · Updated {new Date(incident.updated_at).toLocaleString()}
                                </p>
                                <div className="badges">
                                  <PriorityBadge priority={incident.priority} long />
                                  <StatusBadge status={incident.status} />
                                </div>
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

      <p className="page-note">
        Analyst actions are saved through the API. URL analysis is an experimental aid and requires human review. Clients provide an initial priority; analysts can revise it during triage. Threat category remains a backend default, and evidence file uploads are not implemented yet.
      </p>
    </>
  );
}
