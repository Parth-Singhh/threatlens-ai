import { useEffect, useState } from "react";

type HealthResponse = {
  status: string;
  service: string;
  database: string;
};

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Backend health check failed.");
        }
        return response.json() as Promise<HealthResponse>;
      })
      .then(setHealth)
      .catch((requestError: Error) => setError(requestError.message));
  }, []);

  return (
    <main className="app">
      <section className="hero">
        <span className="eyebrow">THREATLENS AI</span>
        <h1>Unified Cybersecurity Incident Management</h1>
        <p>
          AI-assisted threat analysis and human-in-the-loop incident response,
          built as a single security platform.
        </p>
      </section>

      <section className="status-card">
        <div>
          <span className="label">Application Foundation</span>
          <h2>System Status</h2>
        </div>

        {health ? (
          <div className="status-grid">
            <div>
              <span>API</span>
              <strong>{health.status}</strong>
            </div>
            <div>
              <span>Database</span>
              <strong>{health.database}</strong>
            </div>
            <div>
              <span>Service</span>
              <strong>{health.service}</strong>
            </div>
          </div>
        ) : (
          <p className="message">
            {error ?? "Connecting to the ThreatLens backend..."}
          </p>
        )}
      </section>
    </main>
  );
}

export default App;
