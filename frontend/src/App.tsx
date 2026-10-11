
import { useCallback, useEffect, useState, type FormEvent } from "react";

type User = {
  id: number;
  full_name: string;
  email: string;
  role: "client" | "analyst" | "admin";
  is_active: boolean;
  created_at: string;
};

type AuthResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
};

type Incident = {
  id: number;
  reporter_id: number;
  assigned_analyst_id: number | null;
  incident_type: string;
  title: string;
  description: string;
  evidence_reference: string | null;
  threat_category: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type AuthMode = "login" | "register";

type IncidentUpdatePayload = {
  status?:
    | "submitted"
    | "assigned"
    | "investigating"
    | "escalated"
    | "waiting"
    | "resolved"
    | "closed";
  assigned_analyst_id?: number | null;
};

const incidentTypes = [
  { value: "suspicious_email", label: "Suspicious email" },
  { value: "suspicious_url", label: "Suspicious URL" },
  { value: "suspicious_message", label: "Suspicious message" },
  { value: "suspicious_file", label: "Suspicious file" },
  { value: "suspicious_screenshot", label: "Suspicious screenshot" },
  { value: "other", label: "Other security incident" },
];

const panelStyle = {
  background: "#111827",
  border: "1px solid #273449",
  borderRadius: 16,
  padding: 22,
} as const;

const fieldStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  background: "#0b1220",
  color: "#e5e7eb",
  border: "1px solid #374151",
  borderRadius: 9,
  padding: "12px 13px",
  marginTop: 7,
};

const buttonStyle = {
  border: 0,
  borderRadius: 9,
  padding: "11px 16px",
  background: "#2563eb",
  color: "#ffffff",
  fontWeight: 650,
  cursor: "pointer",
};

function App() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [user, setUser] = useState<User | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [apiStatus, setApiStatus] = useState("Checking connection");

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentError, setIncidentError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentSubmitting, setIncidentSubmitting] = useState(false);

  const [incidentType, setIncidentType] = useState("suspicious_email");
  const [incidentTitle, setIncidentTitle] = useState("");
  const [incidentDescription, setIncidentDescription] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  
  const [analystSearch, setAnalystSearch] = useState("");
  const [analystStatusFilter, setAnalystStatusFilter] = useState("all");
  const [analystPriorityFilter, setAnalystPriorityFilter] = useState("all");
  const [updatingIncidentId, setUpdatingIncidentId] = useState<number | null>(null);

  const loadIncidents = useCallback(async () => {
    const token = sessionStorage.getItem("threatlens_token");
    if (!token) return;

    setIncidentsLoading(true);
    setIncidentError("");

    try {
      const response = await fetch("/api/incidents?skip=0&limit=100", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        throw new Error("Could not load incidents. Please try again.");
      }

      const data: Incident[] = await response.json();
      setIncidents(data);
    } catch (requestError) {
      setIncidentError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load incidents.",
      );
    } finally {
      setIncidentsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const response = await fetch("/api/health");
        if (response.ok) {
          const health = await response.json();
          if (!cancelled) {
            setApiStatus(
              health.status === "healthy"
                ? "All systems operational"
                : "Backend requires attention",
            );
          }
        } else if (!cancelled) {
          setApiStatus("Backend unavailable");
        }
      } catch {
        if (!cancelled) setApiStatus("Backend unavailable");
      }

      const token = sessionStorage.getItem("threatlens_token");

      if (token) {
        try {
          const response = await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!response.ok) {
            sessionStorage.removeItem("threatlens_token");
          } else {
            const currentUser: User = await response.json();
            if (!cancelled) setUser(currentUser);
          }
        } catch {
          if (!cancelled) {
            setError(
              "Unable to verify your session. Check that the backend is running.",
            );
          }
        }
      }

      if (!cancelled) setLoading(false);
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (user) {
      void loadIncidents();
    }
  }, [user, loadIncidents]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const endpoint =
        mode === "login" ? "/api/auth/login" : "/api/auth/register";

      const payload =
        mode === "login"
          ? { email: email.trim(), password }
          : { full_name: fullName.trim(), email: email.trim(), password };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        const detail = data.detail;
        if (typeof detail === "string") throw new Error(detail);
        if (Array.isArray(detail)) {
          throw new Error(
            detail.map((item: { msg?: string }) => item.msg ?? "Invalid input").join(" "),
          );
        }
        throw new Error("Authentication failed. Please try again.");
      }

      const result = data as AuthResponse;
      sessionStorage.setItem("threatlens_token", result.access_token);
      setUser(result.user);
      setPassword("");
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof TypeError
          ? "Cannot reach the backend. Make sure Docker is running."
          : requestError instanceof Error
            ? requestError.message
            : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function signOut() {
    sessionStorage.removeItem("threatlens_token");
    setUser(null);
    setPassword("");
    setError("");
    setMode("login");
    setIncidents([]);
    setSuccessMessage("");
    setIncidentError("");
    setShowIncidentForm(false);
  }

  async function submitIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = sessionStorage.getItem("threatlens_token");
    if (!token) {
      setIncidentError("Your session has expired. Please sign in again.");
      return;
    }

    setIncidentSubmitting(true);
    setIncidentError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          incident_type: incidentType,
          title: incidentTitle.trim(),
          description: incidentDescription.trim(),
          evidence_reference: evidenceReference.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const detail = data.detail;
        if (typeof detail === "string") throw new Error(detail);
        if (Array.isArray(detail)) {
          throw new Error(
            detail.map((item: { msg?: string }) => item.msg ?? "Invalid input").join(" "),
          );
        }
        throw new Error("Incident submission failed.");
      }

      const created = data as Incident;

      setIncidentTitle("");
      setIncidentDescription("");
      setEvidenceReference("");
      setIncidentType("suspicious_email");
      setShowIncidentForm(false);
      setSuccessMessage(`Incident #${created.id} submitted successfully.`);
      await loadIncidents();
    } catch (requestError) {
      setIncidentError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to submit your incident.",
      );
    } finally {
      setIncidentSubmitting(false);
    }
  }

  async function updateIncident(
    incidentId: number,
    changes: IncidentUpdatePayload,
  ) {
    const token = sessionStorage.getItem("threatlens_token");

    if (!token) {
      setIncidentError("Your session has expired. Please sign in again.");
      return;
    }

    setUpdatingIncidentId(incidentId);
    setIncidentError("");
    setSuccessMessage("");

    try {
      const response = await fetch(`/api/incidents/${incidentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(changes),
      });

      const data = await response.json();

      if (!response.ok) {
        const detail = data.detail;
        if (typeof detail === "string") throw new Error(detail);
        if (Array.isArray(detail)) {
          throw new Error(
            detail
              .map((item: { msg?: string }) => item.msg ?? "Invalid input")
              .join(" "),
          );
        }
        throw new Error("Could not update this incident. Please try again.");
      }

      setSuccessMessage(`Incident #${incidentId} updated successfully.`);
      await loadIncidents();
    } catch (requestError) {
      setIncidentError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update the incident.",
      );
    } finally {
      setUpdatingIncidentId(null);
    }
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <div className="loading-mark">T</div>
        <p>Initializing ThreatLens AI...</p>
      </main>
    );
  }

  if (user) {
    const openCount = incidents.filter(
      (item) => !["resolved", "closed"].includes(item.status),
    ).length;
    const criticalCount = incidents.filter(
      (item) => item.priority === "p1",
    ).length;
    const resolvedCount = incidents.filter(
      (item) => ["resolved", "closed"].includes(item.status),
    ).length;
    const unassignedCount = incidents.filter(
      (item) => item.assigned_analyst_id === null && !["resolved", "closed"].includes(item.status),
    ).length;
    const inProgressCount = incidents.filter((item) =>
      ["assigned", "investigating", "escalated", "waiting"].includes(item.status),
    ).length;
    const filteredAnalystIncidents = incidents.filter((incident) => {
      const search = analystSearch.trim().toLowerCase();
      const matchesSearch =
        !search ||
        [
          incident.title,
          incident.description,
          incident.incident_type,
          incident.threat_category,
          String(incident.id),
          String(incident.reporter_id),
          incident.evidence_reference ?? "",
        ].some((value) => value.toLowerCase().includes(search));
      const matchesStatus =
        analystStatusFilter === "all" || incident.status === analystStatusFilter;
      const matchesPriority =
        analystPriorityFilter === "all" || incident.priority === analystPriorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    });

    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#090d16",
          color: "#e5e7eb",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <header
          style={{
            borderBottom: "1px solid #273449",
            padding: "17px 5%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <a
            className="brand"
            href="/"
            style={{ color: "#f9fafb", textDecoration: "none" }}
          >
            <span className="brand-mark">T</span>
            <span>
              ThreatLens<span className="brand-light"> AI</span>
            </span>
          </a>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ color: "#9ca3af", fontSize: 13 }}>
              {user.full_name} · {user.role}
            </span>
            <button
              className="button button-secondary"
              onClick={signOut}
              type="button"
            >
              Sign out
            </button>
          </div>
        </header>

        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "36px 22px 60px",
          }}
        >
          {user.role === "client" ? (
            <>
              <section
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 20,
                  marginBottom: 28,
                }}
              >
                <div>
                  <div className="eyebrow">CLIENT WORKSPACE</div>
                  <h1 style={{ fontSize: "clamp(28px, 4vw, 40px)", margin: "12px 0" }}>
                    Security overview
                  </h1>
                  <p style={{ color: "#9ca3af", margin: 0 }}>
                    Report suspicious activity and track your security incidents.
                  </p>
                </div>
                <button
                  style={buttonStyle}
                  onClick={() => {
                    setShowIncidentForm((visible) => !visible);
                    setIncidentError("");
                    setSuccessMessage("");
                  }}
                  type="button"
                >
                  {showIncidentForm ? "Cancel" : "+ Report an incident"}
                </button>
              </section>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 16,
                  marginBottom: 24,
                }}
              >
                {[
                  { label: "Total incidents", value: incidents.length, icon: "▤" },
                  { label: "Open incidents", value: openCount, icon: "◷" },
                  { label: "Critical priority", value: criticalCount, icon: "!" },
                  { label: "Resolved / closed", value: resolvedCount, icon: "✓" },
                ].map((metric) => (
                  <section key={metric.label} style={panelStyle}>
                    <div
                      style={{
                        color: "#60a5fa",
                        fontSize: 23,
                        marginBottom: 15,
                      }}
                    >
                      {metric.icon}
                    </div>
                    <div style={{ color: "#9ca3af", fontSize: 13 }}>
                      {metric.label}
                    </div>
                    <div
                      style={{
                        fontSize: 30,
                        fontWeight: 750,
                        marginTop: 7,
                      }}
                    >
                      {incidentsLoading ? "…" : metric.value}
                    </div>
                  </section>
                ))}
              </div>

              {successMessage && (
                <div
                  role="status"
                  style={{
                    ...panelStyle,
                    borderColor: "#166534",
                    color: "#86efac",
                    marginBottom: 20,
                  }}
                >
                  ✓ {successMessage}
                </div>
              )}

              {incidentError && (
                <div
                  role="alert"
                  style={{
                    ...panelStyle,
                    borderColor: "#991b1b",
                    color: "#fca5a5",
                    marginBottom: 20,
                  }}
                >
                  {incidentError}
                </div>
              )}

              {showIncidentForm && (
                <section style={{ ...panelStyle, marginBottom: 24 }}>
                  <h2 style={{ marginTop: 0 }}>Report a security incident</h2>
                  <p style={{ color: "#9ca3af", lineHeight: 1.6 }}>
                    Describe what happened. Do not include passwords, access
                    tokens, or other secrets in your report.
                  </p>

                  <form onSubmit={submitIncident}>
                    <label style={{ display: "block", marginBottom: 17 }}>
                      Incident type
                      <select
                        style={fieldStyle}
                        value={incidentType}
                        onChange={(event) => setIncidentType(event.target.value)}
                      >
                        {incidentTypes.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={{ display: "block", marginBottom: 17 }}>
                      Title
                      <input
                        style={fieldStyle}
                        value={incidentTitle}
                        onChange={(event) => setIncidentTitle(event.target.value)}
                        minLength={3}
                        maxLength={160}
                        placeholder="e.g. Suspicious payroll email"
                        required
                      />
                    </label>

                    <label style={{ display: "block", marginBottom: 17 }}>
                      Description
                      <textarea
                        style={{ ...fieldStyle, minHeight: 125, resize: "vertical" }}
                        value={incidentDescription}
                        onChange={(event) =>
                          setIncidentDescription(event.target.value)
                        }
                        minLength={10}
                        maxLength={5000}
                        placeholder="Explain what you noticed, where it appeared, and why it seems suspicious."
                        required
                      />
                    </label>

                    <label style={{ display: "block", marginBottom: 20 }}>
                      Evidence reference (optional)
                      <input
                        style={fieldStyle}
                        value={evidenceReference}
                        onChange={(event) =>
                          setEvidenceReference(event.target.value)
                        }
                        maxLength={1000}
                        placeholder="A safe reference or URL; file uploads are not enabled yet"
                      />
                    </label>

                    <button
                      style={{
                        ...buttonStyle,
                        opacity: incidentSubmitting ? 0.65 : 1,
                      }}
                      type="submit"
                      disabled={incidentSubmitting}
                    >
                      {incidentSubmitting ? "Submitting…" : "Submit incident"}
                    </button>
                  </form>
                </section>
              )}

              <section style={panelStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 12,
                    marginBottom: 18,
                  }}
                >
                  <div>
                    <h2 style={{ margin: "0 0 6px" }}>My incidents</h2>
                    <p style={{ color: "#9ca3af", margin: 0, fontSize: 13 }}>
                      Live data from the ThreatLens API
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void loadIncidents()}
                    disabled={incidentsLoading}
                  >
                    {incidentsLoading ? "Refreshing…" : "↻ Refresh"}
                  </button>
                </div>

                {incidentsLoading && incidents.length === 0 ? (
                  <p style={{ color: "#9ca3af" }}>Loading incidents…</p>
                ) : incidents.length === 0 ? (
                  <div
                    style={{
                      padding: "35px 12px",
                      textAlign: "center",
                      color: "#9ca3af",
                    }}
                  >
                    <div style={{ fontSize: 30, marginBottom: 12 }}>◇</div>
                    <strong style={{ color: "#e5e7eb" }}>
                      No incidents yet
                    </strong>
                    <p>Use “Report an incident” to submit your first report.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        textAlign: "left",
                        fontSize: 13,
                      }}
                    >
                      <thead>
                        <tr style={{ color: "#9ca3af" }}>
                          {["Incident", "Type", "Priority", "Status", "Created"].map(
                            (heading) => (
                              <th
                                key={heading}
                                style={{
                                  padding: "13px 12px",
                                  borderBottom: "1px solid #273449",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {heading}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {incidents.map((incident) => (
                          <tr key={incident.id}>
                            <td
                              style={{
                                padding: "16px 12px",
                                borderBottom: "1px solid #202b3c",
                                minWidth: 190,
                              }}
                            >
                              <strong>#{incident.id} · {incident.title}</strong>
                              <div
                                style={{
                                  color: "#9ca3af",
                                  marginTop: 5,
                                  maxWidth: 280,
                                }}
                              >
                                {incident.description}
                              </div>
                            </td>
                            <td
                              style={{
                                padding: "16px 12px",
                                borderBottom: "1px solid #202b3c",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {incidentTypes.find(
                                (item) => item.value === incident.incident_type,
                              )?.label ?? incident.incident_type}
                            </td>
                            <td
                              style={{
                                padding: "16px 12px",
                                borderBottom: "1px solid #202b3c",
                                whiteSpace: "nowrap",
                              }}
                            >
                              <span
                                style={{
                                  color:
                                    incident.priority === "p1"
                                      ? "#fca5a5"
                                      : incident.priority === "p2"
                                        ? "#fdba74"
                                        : "#cbd5e1",
                                  fontWeight: 700,
                                }}
                              >
                                {incident.priority.toUpperCase()}
                              </span>
                            </td>
                            <td
                              style={{
                                padding: "16px 12px",
                                borderBottom: "1px solid #202b3c",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {incident.status.replaceAll("_", " ")}
                            </td>
                            <td
                              style={{
                                padding: "16px 12px",
                                borderBottom: "1px solid #202b3c",
                                whiteSpace: "nowrap",
                                color: "#9ca3af",
                              }}
                            >
                              {new Date(incident.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <p
                style={{
                  color: "#64748b",
                  fontSize: 12,
                  marginTop: 20,
                  lineHeight: 1.6,
                }}
              >
                Threat category, priority, and status currently use backend
                defaults. AI analysis, file uploads, and analyst-driven
                status changes will be added in later milestones.
              </p>
            </>
          ) : (
            <>
              <section
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 18,
                  margin: "20px 0 26px",
                }}
              >
                <div>
                  <div className="eyebrow">
                    {user.role === "admin" ? "ADMIN WORKSPACE" : "ANALYST WORKSPACE"}
                  </div>
                  <h1 style={{ fontSize: "clamp(28px, 4vw, 40px)", margin: "12px 0" }}>
                    Incident response queue
                  </h1>
                  <p style={{ color: "#9ca3af", margin: 0, lineHeight: 1.6 }}>
                    Review client reports, take ownership, and track each investigation.
                  </p>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void loadIncidents()}
                  disabled={incidentsLoading}
                >
                  {incidentsLoading ? "Refreshing…" : "↻ Refresh queue"}
                </button>
              </section>

              {successMessage && (
                <div
                  role="status"
                  style={{
                    ...panelStyle,
                    borderColor: "#166534",
                    color: "#86efac",
                    marginBottom: 20,
                  }}
                >
                  ✓ {successMessage}
                </div>
              )}

              {incidentError && (
                <div
                  role="alert"
                  style={{
                    ...panelStyle,
                    borderColor: "#991b1b",
                    color: "#fca5a5",
                    marginBottom: 20,
                  }}
                >
                  {incidentError}
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                  gap: 15,
                  marginBottom: 22,
                }}
              >
                {[
                  { label: "All incidents", value: incidents.length, icon: "▤" },
                  { label: "Unassigned", value: unassignedCount, icon: "◷" },
                  { label: "In progress", value: inProgressCount, icon: "↗" },
                  { label: "Resolved / closed", value: resolvedCount, icon: "✓" },
                ].map((metric) => (
                  <section key={metric.label} style={panelStyle}>
                    <div style={{ color: "#60a5fa", fontSize: 23, marginBottom: 12 }}>
                      {metric.icon}
                    </div>
                    <div style={{ color: "#9ca3af", fontSize: 13 }}>{metric.label}</div>
                    <div style={{ fontSize: 29, fontWeight: 750, marginTop: 7 }}>
                      {incidentsLoading && incidents.length === 0 ? "…" : metric.value}
                    </div>
                  </section>
                ))}
              </div>

              <section style={{ ...panelStyle, marginBottom: 22 }}>
                <h2 style={{ margin: "0 0 15px" }}>Find incidents</h2>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 14,
                  }}
                >
                  <label style={{ display: "block", color: "#cbd5e1", fontSize: 13 }}>
                    Search
                    <input
                      style={fieldStyle}
                      value={analystSearch}
                      onChange={(event) => setAnalystSearch(event.target.value)}
                      placeholder="Title, description, ID, reporter…"
                    />
                  </label>
                  <label style={{ display: "block", color: "#cbd5e1", fontSize: 13 }}>
                    Status
                    <select
                      style={fieldStyle}
                      value={analystStatusFilter}
                      onChange={(event) => setAnalystStatusFilter(event.target.value)}
                    >
                      <option value="all">All statuses</option>
                      <option value="submitted">Submitted</option>
                      <option value="assigned">Assigned</option>
                      <option value="investigating">Investigating</option>
                      <option value="escalated">Escalated</option>
                      <option value="waiting">Waiting</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>
                  <label style={{ display: "block", color: "#cbd5e1", fontSize: 13 }}>
                    Priority
                    <select
                      style={fieldStyle}
                      value={analystPriorityFilter}
                      onChange={(event) => setAnalystPriorityFilter(event.target.value)}
                    >
                      <option value="all">All priorities</option>
                      <option value="p1">P1 · Critical</option>
                      <option value="p2">P2 · High</option>
                      <option value="p3">P3 · Medium</option>
                      <option value="p4">P4 · Low</option>
                    </select>
                  </label>
                </div>
                <p style={{ color: "#64748b", fontSize: 12, margin: "13px 0 0" }}>
                  Showing {filteredAnalystIncidents.length} of {incidents.length} incidents. Filters run on the currently loaded queue.
                </p>
              </section>

              <section style={panelStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <h2 style={{ margin: "0 0 6px" }}>All reported incidents</h2>
                    <p style={{ color: "#9ca3af", margin: 0, fontSize: 13 }}>
                      Live records from the ThreatLens API
                    </p>
                  </div>
                </div>

                {incidentsLoading && incidents.length === 0 ? (
                  <p style={{ color: "#9ca3af" }}>Loading incident queue…</p>
                ) : filteredAnalystIncidents.length === 0 ? (
                  <div style={{ padding: "32px 12px", textAlign: "center", color: "#9ca3af" }}>
                    <div style={{ fontSize: 30, marginBottom: 10 }}>◇</div>
                    <strong style={{ color: "#e5e7eb" }}>No matching incidents</strong>
                    <p style={{ marginBottom: 0 }}>Try changing the search or filters.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        minWidth: 960,
                        borderCollapse: "collapse",
                        textAlign: "left",
                        fontSize: 13,
                      }}
                    >
                      <thead>
                        <tr style={{ color: "#9ca3af" }}>
                          {["Incident details", "Reporter / type", "Priority", "Status", "Assignment / actions"].map((heading) => (
                            <th
                              key={heading}
                              style={{
                                padding: "13px 12px",
                                borderBottom: "1px solid #273449",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAnalystIncidents.map((incident) => {
                          const isUpdating = updatingIncidentId === incident.id;
                          const isAssignedToMe = incident.assigned_analyst_id === user.id;
                          const typeLabel =
                            incidentTypes.find((item) => item.value === incident.incident_type)?.label ??
                            incident.incident_type.replaceAll("_", " ");

                          return (
                            <tr key={incident.id}>
                              <td
                                style={{
                                  padding: "17px 12px",
                                  borderBottom: "1px solid #202b3c",
                                  verticalAlign: "top",
                                  minWidth: 250,
                                  maxWidth: 370,
                                }}
                              >
                                <strong style={{ color: "#f3f4f6", display: "block", marginBottom: 7 }}>
                                  #{incident.id} · {incident.title}
                                </strong>
                                <div style={{ color: "#9ca3af", lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                                  {incident.description}
                                </div>
                                {incident.evidence_reference && (
                                  <div style={{ marginTop: 9, overflowWrap: "anywhere" }}>
                                    <span style={{ color: "#64748b" }}>Evidence: </span>
                                    <a
                                      href={incident.evidence_reference}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{ color: "#93c5fd" }}
                                    >
                                      {incident.evidence_reference}
                                    </a>
                                  </div>
                                )}
                                <div style={{ color: "#64748b", fontSize: 11, marginTop: 9 }}>
                                  Created {new Date(incident.created_at).toLocaleString()} · Updated {new Date(incident.updated_at).toLocaleString()}
                                </div>
                              </td>
                              <td style={{ padding: "17px 12px", borderBottom: "1px solid #202b3c", verticalAlign: "top", whiteSpace: "nowrap" }}>
                                <div>Client #{incident.reporter_id}</div>
                                <div style={{ color: "#9ca3af", marginTop: 6 }}>{typeLabel}</div>
                                <div style={{ color: "#64748b", fontSize: 11, marginTop: 6 }}>
                                  Category: {incident.threat_category.replaceAll("_", " ")}
                                </div>
                              </td>
                              <td style={{ padding: "17px 12px", borderBottom: "1px solid #202b3c", verticalAlign: "top", whiteSpace: "nowrap" }}>
                                <span
                                  style={{
                                    color: incident.priority === "p1" ? "#fca5a5" : incident.priority === "p2" ? "#fdba74" : incident.priority === "p3" ? "#fcd34d" : "#86efac",
                                    fontWeight: 750,
                                  }}
                                >
                                  {incident.priority.toUpperCase()}
                                </span>
                              </td>
                              <td style={{ padding: "13px 12px", borderBottom: "1px solid #202b3c", verticalAlign: "top", minWidth: 150 }}>
                                <select
                                  style={{ ...fieldStyle, marginTop: 0, minWidth: 145, padding: "9px 10px" }}
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
                                      void updateIncident(incident.id, {
                                        status: nextStatus,
                                        assigned_analyst_id: user.id,
                                      });
                                    } else {
                                      void updateIncident(incident.id, { status: nextStatus });
                                    }
                                  }}
                                >
                                  <option value="submitted">Submitted</option>
                                  <option value="assigned">Assigned</option>
                                  <option value="investigating">Investigating</option>
                                  <option value="escalated">Escalated</option>
                                  <option value="waiting">Waiting</option>
                                  <option value="resolved">Resolved</option>
                                  <option value="closed">Closed</option>
                                </select>
                                {isUpdating && <div style={{ color: "#93c5fd", fontSize: 11, marginTop: 6 }}>Saving…</div>}
                              </td>
                              <td style={{ padding: "13px 12px", borderBottom: "1px solid #202b3c", verticalAlign: "top", minWidth: 180 }}>
                                {incident.assigned_analyst_id === null ? (
                                  <div style={{ color: "#fbbf24", marginBottom: 10 }}>Unassigned</div>
                                ) : (
                                  <div style={{ color: isAssignedToMe ? "#86efac" : "#cbd5e1", marginBottom: 10 }}>
                                    Analyst #{incident.assigned_analyst_id}{isAssignedToMe ? " · You" : ""}
                                  </div>
                                )}
                                {user.role === "analyst" && !isAssignedToMe && (
                                  <button
                                    type="button"
                                    disabled={isUpdating}
                                    onClick={() => void updateIncident(incident.id, { assigned_analyst_id: user.id })}
                                    style={{
                                      ...buttonStyle,
                                      background: "#1d4ed8",
                                      opacity: isUpdating ? 0.65 : 1,
                                      cursor: isUpdating ? "wait" : "pointer",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {isUpdating ? "Saving…" : incident.assigned_analyst_id === null ? "Assign to me" : "Reassign to me"}
                                  </button>
                                )}
                                {user.role === "analyst" && isAssignedToMe && (
                                  <span style={{ color: "#86efac", fontSize: 12 }}>✓ Assigned to you</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <p style={{ color: "#64748b", fontSize: 12, marginTop: 18, lineHeight: 1.6 }}>
                Analyst actions are saved through the API. Priority and threat category are still backend defaults; AI classification and evidence file uploads are not implemented yet.
              </p>
            </>
          )}

          <footer
            style={{
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
              color: "#64748b",
              fontSize: 12,
              marginTop: 30,
            }}
          >
            <span>THREATLENS AI · {apiStatus}</span>
            <span>Intelligence. Visibility. Response.</span>
          </footer>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-layout">
      <section className="intro-panel">
        <header className="brand">
          <span className="brand-mark">T</span>
          <span>
            ThreatLens<span className="brand-light"> AI</span>
          </span>
        </header>

        <div className="intro-content">
          <div className="eyebrow">
            <span className="status-dot" />
            UNIFIED SECURITY OPERATIONS
          </div>

          <h1>
            See threats
            <br />
            <span className="gradient-text">before they</span>
            <br />
            become incidents.
          </h1>

          <p className="intro-description">
            One platform to analyze threats, prioritize incidents, and
            coordinate a smarter human-led security response.
          </p>

          <div className="feature-list">
            <div className="feature">
              <span className="feature-icon">01</span>
              <div>
                <strong>AI-assisted threat analysis</strong>
                <p>Turn suspicious activity into actionable intelligence.</p>
              </div>
            </div>
            <div className="feature">
              <span className="feature-icon">02</span>
              <div>
                <strong>Unified incident management</strong>
                <p>Track investigations from submission to resolution.</p>
              </div>
            </div>
            <div className="feature">
              <span className="feature-icon">03</span>
              <div>
                <strong>Human-led decisions</strong>
                <p>Keep analysts in control of every critical decision.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="intro-footer">
          <span className="status-dot" />
          {apiStatus}
          <span className="footer-divider">/</span>
          DEVELOPMENT ENVIRONMENT
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="mobile-brand brand">
            <span className="brand-mark">T</span>
            <span>
              ThreatLens<span className="brand-light"> AI</span>
            </span>
          </div>

          <div className="auth-heading">
            <span className="eyebrow">
              {mode === "login" ? "WELCOME BACK" : "GET STARTED"}
            </span>
            <h2>
              {mode === "login"
                ? "Sign in to your workspace"
                : "Create your account"}
            </h2>
            <p>
              {mode === "login"
                ? "Enter your credentials to continue to ThreatLens AI."
                : "Create a client account to get started with ThreatLens AI."}
            </p>
          </div>

          <div className="auth-tabs">
            <button
              className={mode === "login" ? "auth-tab active" : "auth-tab"}
              onClick={() => {
                setMode("login");
                setError("");
              }}
              type="button"
            >
              Sign in
            </button>
            <button
              className={mode === "register" ? "auth-tab active" : "auth-tab"}
              onClick={() => {
                setMode("register");
                setError("");
              }}
              type="button"
            >
              Create account
            </button>
          </div>

          {error && (
            <div className="error-message" role="alert">
              <span>!</span>
              {error}
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "register" && (
              <label className="field">
                <span>Full name</span>
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  minLength={2}
                  maxLength={120}
                  required
                />
              </label>
            )}

            <label className="field">
              <span>Email address</span>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <div className="password-input">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder={
                    mode === "login"
                      ? "Enter your password"
                      : "At least 8 characters"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={mode === "register" ? 8 : undefined}
                  maxLength={128}
                  required
                />
                <button
                  className="show-password"
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <button
              className="button button-primary submit-button"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="spinner" />
                  {mode === "login" ? "Signing in..." : "Creating account..."}
                </>
              ) : (
                <>
                  {mode === "login"
                    ? "Sign in to ThreatLens"
                    : "Create client account"}
                  <span aria-hidden="true">→</span>
                </>
              )}
            </button>
          </form>

          <p className="security-note">
            <span>◇</span>
            Protected access · Role-based authorization
          </p>

          <div className="auth-switch">
            {mode === "login" ? (
              <>
                New to ThreatLens AI?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setError("");
                  }}
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </div>

          <p className="disclaimer">
            ThreatLens AI is under active development. AI threat analysis and
            incident workflows are being built incrementally.
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

export default App;
