import { useEffect, useState } from "react";
import { getApiHealth } from "./api/health";

type ApiState =
  | { status: "checking" }
  | { status: "available" }
  | { status: "unavailable"; message: string };

export function App() {
  const [apiState, setApiState] = useState<ApiState>({ status: "checking" });

  useEffect(() => {
    const controller = new AbortController();

    getApiHealth(controller.signal)
      .then(() => setApiState({ status: "available" }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setApiState({
            status: "unavailable",
            message: error instanceof Error ? error.message : "Unknown connection error"
          });
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="page">
      <section className="welcome-card" aria-labelledby="page-title">
        <p className="eyebrow">Local development foundation</p>
        <h1 id="page-title">Japan Higher Study Management System</h1>
        <p className="intro">
          A workspace for organizing student journeys and higher-education opportunities in Japan.
        </p>
        <div className={`api-status api-status--${apiState.status}`} role="status" aria-live="polite">
          <span className="status-indicator" aria-hidden="true" />
          {apiState.status === "checking" && "Checking API connection…"}
          {apiState.status === "available" && "API connection is available"}
          {apiState.status === "unavailable" && `API connection unavailable: ${apiState.message}`}
        </div>
        <p className="scope-note">
          This foundation does not yet store student data or provide user accounts.
        </p>
      </section>
    </main>
  );
}
