export interface ApiHealth {
  status: "ok";
  service: "api";
}

export async function getApiHealth(signal: AbortSignal): Promise<ApiHealth> {
  const response = await fetch("/api/health", { signal });

  if (!response.ok) {
    throw new Error(`API returned HTTP ${response.status}`);
  }

  const result: unknown = await response.json();

  if (
    typeof result !== "object" ||
    result === null ||
    !("status" in result) ||
    result.status !== "ok" ||
    !("service" in result) ||
    result.service !== "api"
  ) {
    throw new Error("API returned an unexpected health response");
  }

  return { status: result.status, service: result.service };
}
