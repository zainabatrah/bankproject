const AUTH_SESSION_STORAGE_KEY = "bankshield.auth.session.v1";

export const SOC_API_URL = (
  import.meta.env.VITE_SOC_API_URL?.trim() || "http://localhost:3000/soc"
).replace(/\/+$/, "");

function getAccessToken() {
  const configuredToken = import.meta.env.VITE_SOC_ACCESS_TOKEN?.trim();
  if (configuredToken) return configuredToken;

  if (typeof window === "undefined") return "";

  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const rawSession = storage.getItem(AUTH_SESSION_STORAGE_KEY);
      if (!rawSession) continue;

      const session = JSON.parse(rawSession);
      if (
        session &&
        session.isDemo !== true &&
        typeof session.accessToken === "string"
      ) {
        return session.accessToken;
      }
    } catch {
      // Try the next storage location when a browser storage entry is invalid.
    }
  }

  return "";
}

function getErrorMessage(payload, fallback) {
  if (typeof payload === "string" && payload.trim()) return payload;

  if (payload && typeof payload === "object") {
    const message = payload.message;
    if (Array.isArray(message)) return message.join(" ");
    if (typeof message === "string" && message.trim()) return message;
    if (typeof payload.detail === "string" && payload.detail.trim()) {
      return payload.detail;
    }
  }

  return fallback;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function socRequest(path, options = {}) {
  const { body, headers = {}, ...requestOptions } = options;
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");

  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const accessToken = getAccessToken();
  if (accessToken) {
    requestHeaders.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${SOC_API_URL}${path}`, {
    ...requestOptions,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload, `SOC request failed (${response.status})`),
    );
  }

  return payload;
}

async function downloadSocFile(path, filename) {
  const accessToken = getAccessToken();
  const headers = new Headers({ Accept: "application/octet-stream" });
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${SOC_API_URL}${path}`, { headers });
  if (!response.ok) {
    const payload = await parseResponse(response);
    throw new Error(
      getErrorMessage(payload, `Report download failed (${response.status})`),
    );
  }

  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const socApi = {
  getSummary: () => socRequest("/summary"),
  getAlerts: () => socRequest("/alerts"),
  getRiskDistribution: () => socRequest("/analytics/risk-distribution"),
  getAlertsPerDay: () => socRequest("/analytics/alerts-per-day"),
  getCasesByStatus: () => socRequest("/analytics/cases-by-status"),
  getSecurityEventsByType: () =>
    socRequest("/analytics/security-events-by-type"),
  getSecurityEvents: () => socRequest("/security-events"),
  getAuditLogs: () => socRequest("/audit-logs"),
  getCases: () => socRequest("/cases"),
  updateAlertStatus: (id, status) =>
    socRequest(`/alerts/${id}/status`, { method: "PATCH", body: { status } }),
  addNote: (id, note) =>
    socRequest(`/alerts/${id}/notes`, { method: "POST", body: { note } }),
  createCase: (payload) =>
    socRequest("/cases", { method: "POST", body: payload }),
  updateCaseStatus: (id, status) =>
    socRequest(`/cases/${id}/status`, { method: "PATCH", body: { status } }),
  downloadAlertsCsv: () =>
    downloadSocFile("/reports/alerts.csv", "bankshield-alerts.csv"),
  downloadSecurityReport: () =>
    downloadSocFile("/reports/security-report.json", "bankshield-security-report.json"),
};

export default socApi;
