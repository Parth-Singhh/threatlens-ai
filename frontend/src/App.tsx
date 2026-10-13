import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  type AuthMode,
  type AuthResponse,
  type Incident,
  type IncidentPriority,
  type IncidentUpdatePayload,
  type QueueScope,
  type UrlAnalysisResponse,
  type User,
  type View,
} from "./types";
import { extractDetail, isOpen } from "./lib";
import { LoadingScreen } from "./components/Brand";
import { AuthScreen } from "./components/AuthScreen";
import { Shell, Toasts, type NavItem } from "./components/Shell";
import { IncidentDrawer } from "./components/IncidentDrawer";
import { UrlAnalyzer } from "./components/UrlAnalyzer";
import { PageHead } from "./components/Panels";
import { ClientIncidents, ClientOverview } from "./components/ClientViews";
import { CommandCenter, IncidentQueue } from "./components/AnalystViews";

const VIEWS: View[] = ["overview", "incidents", "analyzer"];

function readView(): View {
  const hash = window.location.hash.replace(/^#\/?/, "");
  return (VIEWS as string[]).includes(hash) ? (hash as View) : "overview";
}

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

  const [view, setView] = useState<View>(readView);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentError, setIncidentError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentSubmitting, setIncidentSubmitting] = useState(false);

  const [incidentType, setIncidentType] = useState("suspicious_email");
  const [incidentPriority, setIncidentPriority] = useState<IncidentPriority>("p3");
  const [incidentTitle, setIncidentTitle] = useState("");
  const [incidentDescription, setIncidentDescription] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");

  const [analystSearch, setAnalystSearch] = useState("");
  const [analystStatusFilter, setAnalystStatusFilter] = useState("all");
  const [analystPriorityFilter, setAnalystPriorityFilter] = useState("all");
  const [analystScope, setAnalystScope] = useState<QueueScope>("all");
  const [updatingIncidentId, setUpdatingIncidentId] = useState<number | null>(null);

  const [urlToAnalyze, setUrlToAnalyze] = useState("");
  const [urlAnalysis, setUrlAnalysis] = useState<UrlAnalysisResponse | null>(null);
  const [urlAnalysisLoading, setUrlAnalysisLoading] = useState(false);
  const [urlAnalysisError, setUrlAnalysisError] = useState("");

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

  useEffect(() => {
    const onHash = () => setView(readView());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((next: View) => {
    setView(next);
    window.location.hash = next;
    window.scrollTo({ top: 0 });
  }, []);

  const dismissSuccess = useCallback(() => setSuccessMessage(""), []);
  const dismissError = useCallback(() => setIncidentError(""), []);

  const openIncidentForm = useCallback(() => {
    setShowIncidentForm(true);
    setIncidentError("");
    setSuccessMessage("");
  }, []);

  const closeIncidentForm = useCallback(() => {
    setShowIncidentForm(false);
    setIncidentError("");
    setSuccessMessage("");
  }, []);

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
        const detail = extractDetail(data.detail);
        throw new Error(detail ?? "Authentication failed. Please try again.");
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
    setView("overview");
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
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
          priority: incidentPriority,
          title: incidentTitle.trim(),
          description: incidentDescription.trim(),
          evidence_reference: evidenceReference.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const detail = extractDetail(data.detail);
        throw new Error(detail ?? "Incident submission failed.");
      }

      const created = data as Incident;

      setIncidentTitle("");
      setIncidentDescription("");
      setEvidenceReference("");
      setIncidentType("suspicious_email");
      setIncidentPriority("p3");
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
        const detail = extractDetail(data.detail);
        throw new Error(detail ?? "Could not update this incident. Please try again.");
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

  async function submitUrlAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = sessionStorage.getItem("threatlens_token");
    if (!token) {
      setUrlAnalysisError("Your session has expired. Please sign in again.");
      return;
    }

    setUrlAnalysisLoading(true);
    setUrlAnalysisError("");
    setUrlAnalysis(null);

    try {
      const response = await fetch("/api/analysis/url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: urlToAnalyze.trim() }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = extractDetail(data?.detail);
        throw new Error(detail ?? "URL analysis failed. Please try again.");
      }

      setUrlAnalysis(data as UrlAnalysisResponse);
      setUrlToAnalyze((data as UrlAnalysisResponse).url ?? urlToAnalyze.trim());
    } catch (requestError) {
      setUrlAnalysisError(
        requestError instanceof TypeError
          ? "Cannot reach the analysis API. Check that Docker is running."
          : requestError instanceof Error
            ? requestError.message
            : "Unable to analyze this URL.",
      );
    } finally {
      setUrlAnalysisLoading(false);
    }
  }

  function prepareUrlAnalysisIncident() {
    if (!urlAnalysis) return;

    const description = [
      "A URL was submitted for AI-assisted security review.",
      `URL: ${urlAnalysis.url}`,
      `Experimental model output: ${urlAnalysis.prediction}`,
      `Raw model phishing score: ${(urlAnalysis.phishing_probability * 100).toFixed(2)}%`,
      `Model risk label: ${urlAnalysis.risk_level}`,
      "",
      "Important: the model is experimental and has produced false positives on legitimate websites. This result is not proof of maliciousness; human review is required.",
      "",
      "Returned URL signals:",
      ...(urlAnalysis.signals.length ? urlAnalysis.signals.map((signal) => `- ${signal}`) : ["- No signals returned"]),
      "",
      `Model note: ${urlAnalysis.explanation_note}`,
    ].join("\n");

    setIncidentType("suspicious_url");
    setIncidentTitle(`Review URL: ${urlAnalysis.url}`.slice(0, 160));
    setIncidentDescription(description.slice(0, 5000));
    setEvidenceReference(urlAnalysis.url.slice(0, 1000));
    setShowIncidentForm(true);
    setIncidentError("");
    setSuccessMessage("");
  }

  if (loading) return <LoadingScreen />;

  if (!user) {
    return (
      <AuthScreen
        mode={mode}
        setMode={setMode}
        fullName={fullName}
        setFullName={setFullName}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        submitting={submitting}
        error={error}
        setError={setError}
        apiStatus={apiStatus}
        onSubmit={handleSubmit}
      />
    );
  }

  const isClient = user.role === "client";
  const openCount = incidents.filter(isOpen).length;
  const unassignedCount = incidents.filter(
    (item) => item.assigned_analyst_id === null && isOpen(item),
  ).length;

  const nav: NavItem[] = isClient
    ? [
        { id: "overview", label: "Overview", icon: "overview" },
        { id: "incidents", label: "My incidents", icon: "list", badge: openCount },
        { id: "analyzer", label: "URL analyzer", icon: "scan" },
      ]
    : [
        { id: "overview", label: "Command center", icon: "overview" },
        { id: "incidents", label: "Incident queue", icon: "list", badge: unassignedCount },
        { id: "analyzer", label: "URL analyzer", icon: "scan" },
      ];

  const titles: Record<View, string> = isClient
    ? { overview: "Overview", incidents: "My incidents", analyzer: "URL analyzer" }
    : { overview: "Command center", incidents: "Incident queue", analyzer: "URL analyzer" };

  const eyebrow = isClient ? "Client" : user.role === "admin" ? "Admin" : "Analyst";

  return (
    <>
      <Shell
        user={user}
        nav={nav}
        view={view}
        onView={navigate}
        title={titles[view]}
        eyebrow={eyebrow}
        apiStatus={apiStatus}
        onSignOut={signOut}
        onReport={isClient ? openIncidentForm : undefined}
      >
        {view === "analyzer" ? (
          <>
            <PageHead
              eyebrow={isClient ? "CLIENT WORKSPACE" : user.role === "admin" ? "ADMIN WORKSPACE" : "ANALYST WORKSPACE"}
              title="URL threat analysis"
              sub="Experimental model-assisted triage of suspicious links. Results are decision aids, never verdicts."
            />
            <UrlAnalyzer
              url={urlToAnalyze}
              setUrl={setUrlToAnalyze}
              analysis={urlAnalysis}
              loading={urlAnalysisLoading}
              error={urlAnalysisError}
              onSubmit={submitUrlAnalysis}
              onUseInIncident={isClient ? prepareUrlAnalysisIncident : undefined}
            />
          </>
        ) : isClient ? (
          view === "overview" ? (
            <ClientOverview
              incidents={incidents}
              loading={incidentsLoading}
              onReport={openIncidentForm}
              onNavigate={navigate}
            />
          ) : (
            <ClientIncidents
              incidents={incidents}
              loading={incidentsLoading}
              onRefresh={() => void loadIncidents()}
              onReport={openIncidentForm}
            />
          )
        ) : view === "overview" ? (
          <CommandCenter
            user={user}
            incidents={incidents}
            loading={incidentsLoading}
            updatingId={updatingIncidentId}
            onRefresh={() => void loadIncidents()}
            onNavigate={navigate}
            onTriage={(scope, priority) => {
              setAnalystScope(scope);
              setAnalystPriorityFilter(priority);
              setAnalystStatusFilter("all");
              setAnalystSearch("");
              navigate("incidents");
            }}
            onUpdate={(id, changes) => void updateIncident(id, changes)}
          />
        ) : (
          <IncidentQueue
            user={user}
            incidents={incidents}
            loading={incidentsLoading}
            updatingId={updatingIncidentId}
            search={analystSearch}
            setSearch={setAnalystSearch}
            statusFilter={analystStatusFilter}
            setStatusFilter={setAnalystStatusFilter}
            priorityFilter={analystPriorityFilter}
            setPriorityFilter={setAnalystPriorityFilter}
            scope={analystScope}
            setScope={setAnalystScope}
            onRefresh={() => void loadIncidents()}
            onUpdate={(id, changes) => void updateIncident(id, changes)}
          />
        )}
      </Shell>

      {isClient && (
        <IncidentDrawer
          open={showIncidentForm}
          onClose={closeIncidentForm}
          onSubmit={submitIncident}
          submitting={incidentSubmitting}
          type={incidentType}
          setType={setIncidentType}
          priority={incidentPriority}
          setPriority={setIncidentPriority}
          title={incidentTitle}
          setTitle={setIncidentTitle}
          description={incidentDescription}
          setDescription={setIncidentDescription}
          evidence={evidenceReference}
          setEvidence={setEvidenceReference}
        />
      )}

      <Toasts
        success={successMessage}
        error={incidentError}
        onDismissSuccess={dismissSuccess}
        onDismissError={dismissError}
      />
    </>
  );
}

export default App;
