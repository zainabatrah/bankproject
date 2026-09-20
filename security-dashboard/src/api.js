export const AUTH_SESSION_STORAGE_KEY = "bankshield.auth.session.v1";
const DEVICE_ID_STORAGE_KEY = "bankshield.soc.device.v1";
const ALLOWED_SOC_ROLES = new Set([
  "FRAUD_ANALYST",
  "SECURITY_ANALYST",
  "ADMIN",
]);
export const AUTH_SESSION_EVENT = "bankshield:soc-auth-changed";

let refreshPromise = null;

export const SOC_API_URL = (
  import.meta.env.VITE_SOC_API_URL?.trim() ||
  `${import.meta.env.VITE_API_URL?.trim() || "http://localhost:3000"}/soc`
).replace(/\/+$/, "");

export const API_URL = (
  import.meta.env.VITE_API_URL?.trim() || SOC_API_URL.replace(/\/soc$/, "")
).replace(/\/+$/, "");

export function getStoredSession() {
  if (typeof window === "undefined") return null;

  try {
    const rawSession = window.localStorage.getItem(
      AUTH_SESSION_STORAGE_KEY,
    );

    if (!rawSession) return null;

    const session = JSON.parse(rawSession);

    if (
      !session ||
      session.isDemo === true ||
      typeof session.accessToken !== "string" ||
      typeof session.refreshToken !== "string" ||
      !session.user
    ) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

function saveStoredSession(session) {
  window.localStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify(session),
  );
  window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
}

export function clearStoredSession() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
   window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
}

function getDeviceId() {
  if (typeof window === "undefined") return "soc-dashboard";

  let deviceId = window.localStorage.getItem(
    DEVICE_ID_STORAGE_KEY,
  );

  if (!deviceId) {
    deviceId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `soc-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    window.localStorage.setItem(
      DEVICE_ID_STORAGE_KEY,
      deviceId,
    );
  }

  return deviceId;
}

function getAccessToken() {
  const configuredToken =
    import.meta.env.VITE_SOC_ACCESS_TOKEN?.trim();

  if (configuredToken) return configuredToken;

  return getStoredSession()?.accessToken ?? "";
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
  return apiRequest(`${SOC_API_URL}${path}`, options);
}

export async function backendRequest(path, options = {}) {
  return apiRequest(`${API_URL}${path}`, options);
}

async function refreshSession() {
  const session = getStoredSession();

  if (!session?.refreshToken) {
    throw new Error("No refreshable session is available.");
  }

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Device-ID": getDeviceId(),
    },
    body: JSON.stringify({
      refreshToken: session.refreshToken,
    }),
  });

  const payload = await parseResponse(response);

  if (!response.ok) {
    clearStoredSession();

    throw new Error(
      getErrorMessage(
        payload,
        "Your session has expired. Please sign in again.",
      ),
    );
  }

  const latestSession = getStoredSession();

  if (!latestSession) {
    throw new Error("The session ended while refreshing.");
  }

  const refreshedSession = {
    ...latestSession,
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
  };

  saveStoredSession(refreshedSession);

  return refreshedSession;
}

function refreshAuthSession() {
  if (!refreshPromise) {
    refreshPromise = refreshSession().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

async function apiRequest(url, options = {}, retry = true) {
  const {
    body,
    headers = {},
    skipAuth = false,
    ...requestOptions
  } = options;

  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");
  requestHeaders.set("X-Device-ID", getDeviceId());

  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (!skipAuth) {
    const accessToken = getAccessToken();

    if (accessToken) {
      requestHeaders.set(
        "Authorization",
        `Bearer ${accessToken}`,
      );
    }
  }

  const response = await fetch(url, {
    ...requestOptions,
    headers: requestHeaders,
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body),
  });

  const payload = await parseResponse(response);

  if (
    response.status === 401 &&
    retry &&
    !skipAuth &&
    getStoredSession()?.refreshToken
  ) {
    await refreshAuthSession();
    return apiRequest(url, options, false);
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearStoredSession();
    }

    const error = new Error(
      getErrorMessage(
        payload,
        `SOC request failed (${response.status})`,
      ),
    );

    error.status = response.status;
    throw error;
  }

  return payload;
}

function mapAlert(alert) {
  const transaction = alert.transaction ?? {};

  return {
    id: alert.id,
    amount: alert.amount ?? transaction.amount ?? 0,
    currency: alert.currency ?? transaction.currency ?? "USD",
    risk_score: alert.risk_score ?? alert.riskScore ?? 0,
    severity: alert.severity ?? alert.riskLevel ?? "LOW",
    reason: alert.reason ?? "",
    decision: alert.decision ?? transaction.status ?? "FLAGGED",
    status: alert.status ?? "OPEN",
    transaction_id: alert.transaction_id ?? alert.transactionId,
    reference: alert.reference ?? transaction.reference ?? "",
    created_at: alert.created_at ?? alert.createdAt,
    updated_at: alert.updated_at ?? alert.updatedAt,
  };
}

function mapSecurityEvent(event) {
  return {
    id: event.id,
    event_type: event.event_type ?? event.eventType ?? "SECURITY_EVENT",
    severity: event.severity ?? event.risk_level ?? event.riskLevel ?? "LOW",
    description: event.description ?? "",
    created_at: event.created_at ?? event.createdAt,
  };
}

function mapAuditLog(log) {
  const [entityType, ...entityParts] = (log.resource ?? "").split(":");
  const user = log.user;

  return {
    id: log.id,
    action: log.action,
    entity_type: log.entity_type ?? entityType ?? "SYSTEM",
    entity_id: log.entity_id ?? (entityParts.join(":") || null),
    actor:
      log.actor ??
      (user
        ? `${user.firstName ?? ""} ${user.lastName ?? ""} (${user.email ?? "unknown"})`.trim()
        : "System"),
    result: log.result,
    details: log.details,
    created_at: log.created_at ?? log.createdAt,
  };
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

export const authApi = {
  async login(email, password) {
    const result = await backendRequest("/auth/login", {
      method: "POST",
      skipAuth: true,
      body: {
        email: email.trim().toLowerCase(),
        password,
      },
    });

    if (result.mfaRequired) {
      return result;
    }

    if (!result.user || !ALLOWED_SOC_ROLES.has(result.user.role)) {
      if (result.refreshToken) {
        await backendRequest("/auth/logout", {
          method: "POST",
          skipAuth: true,
          body: {
            refreshToken: result.refreshToken,
          },
        }).catch(() => {});
      }

      throw new Error(
        "This dashboard is restricted to security analysts, fraud analysts, and administrators.",
      );
    }

    saveStoredSession(result);
    return result;
  },

  async verifyMfa(mfaToken, code) {
  const result = await backendRequest(
    "/auth/mfa/login-verify",
    {
      method: "POST",
      skipAuth: true,
      body: {
        mfaToken,
        code,
      },
    },
  );

  if (!result.user || !ALLOWED_SOC_ROLES.has(result.user.role)) {
    if (result.refreshToken) {
      await backendRequest("/auth/logout", {
        method: "POST",
        skipAuth: true,
        body: {
          refreshToken: result.refreshToken,
        },
      }).catch(() => {});
    }

    throw new Error(
      "This dashboard is restricted to security analysts, fraud analysts, and administrators.",
    );
  }

  saveStoredSession(result);
  return result;
},

  async logout() {
    const session = getStoredSession();

    clearStoredSession();

    if (!session?.refreshToken) return;

    await backendRequest("/auth/logout", {
      method: "POST",
      skipAuth: true,
      body: {
        refreshToken: session.refreshToken,
      },
    }).catch(() => {});
  },

  getSession: getStoredSession,
};

export const socApi = {
  getSummary: () => socRequest("/summary"),
  getAlerts: async () => {
    const alerts = await backendRequest(
      "/fraud-alerts?limit=100"
    );

    return Array.isArray(alerts)
      ? alerts.map(mapAlert)
      : [];
  },

  getNotifications: (unreadOnly = false) =>
    socRequest(
      `/notifications?unread_only=${unreadOnly}`
    ),

  markNotificationRead: (id) =>
    socRequest(
      `/notifications/${id}/read`,
      {
        method: "PATCH",
      }
    ),
  getRiskDistribution: () => socRequest("/analytics/risk-distribution"),
  getAlertsPerDay: () => socRequest("/analytics/alerts-per-day"),
  getCasesByStatus: () => socRequest("/analytics/cases-by-status"),
  getSecurityEventsByType: () =>
    socRequest("/analytics/security-events-by-type"),
  getSecurityEvents: async () => {
    const events = await backendRequest("/security-events?limit=100");
    return Array.isArray(events) ? events.map(mapSecurityEvent) : [];
  },
  getAuditLogs: async () => {
    const logs = await backendRequest("/audit-logs?limit=100");
    return Array.isArray(logs) ? logs.map(mapAuditLog) : [];
  },
  getCases: () => socRequest("/cases"),
  updateAlertStatus: (id, status) =>
    backendRequest(`/fraud-alerts/${id}/status`, {
      method: "PATCH",
      body: { status },
    }),
  addNote: (id, note) =>
    socRequest(`/alerts/${id}/notes`, { method: "POST", body: { note } }),
  createCase: (payload) =>
    socRequest("/cases", { method: "POST", body: payload }),
  updateCaseStatus: (id, status) =>
    socRequest(`/cases/${id}/status`, { method: "PATCH", body: { status } }),
  downloadAlertsCsv: () =>
    downloadSocFile("/reports/alerts.csv", "bankshield-alerts.csv"),
  downloadSecurityReport: () =>
    downloadSocFile(
      "/reports/security-report.json",
      "bankshield-security-report.json",
    ),
};

export default socApi;
