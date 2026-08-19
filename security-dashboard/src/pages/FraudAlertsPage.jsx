import { useEffect, useState } from "react";

const API_URL = "http://127.0.0.1:8001";

function FraudAlertsPage() {
    const [alerts, setAlerts] = useState([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [severityFilter, setSeverityFilter] =
        useState("ALL");

    const [savingAlertId, setSavingAlertId] =
        useState(null);

    const [creatingCaseAlertId, setCreatingCaseAlertId] =
        useState(null);

    const [message, setMessage] = useState("");

    const [statusFilter, setStatusFilter] =
        useState("ALL");

    const [updatingAlertStatusId, setUpdatingAlertStatusId] =
        useState(null);
    useEffect(() => {
        async function loadAlerts() {
            try {
                const response = await fetch(`${API_URL}/alerts`);

                if (!response.ok) {
                    throw new Error("Could not load fraud alerts");
                }

                const data = await response.json();
                setAlerts(data);
            } catch {
                setError("Could not connect to FastAPI");
            } finally {
                setLoading(false);
            }
        }

        loadAlerts();
    }, []);

    const filteredAlerts = alerts.filter((alert) => {
        const matchesSeverity =
            severityFilter === "ALL" ||
            alert.severity === severityFilter;

        const matchesStatus =
            statusFilter === "ALL" ||
            alert.status === statusFilter;

        return matchesSeverity && matchesStatus;
    });

    const availableStatuses = [
        ...new Set(alerts.map((alert) => alert.status)),
    ];



    async function addAnalystNote(alert) {
        const note = window.prompt(
            `Enter an analyst note for Alert #${alert.id}`
        );

        if (!note || !note.trim()) {
            return;
        }

        try {
            setSavingAlertId(alert.id);
            setMessage("");
            setError("");

            const response = await fetch(
                `${API_URL}/alerts/${alert.id}/notes`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        note: note.trim(),
                    }),
                }
            );

            if (!response.ok) {
                const errorData = await response.json();

                throw new Error(
                    errorData.detail || "Could not save note"
                );
            }

            setMessage(
                `Note added successfully to Alert #${alert.id}`
            );
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setSavingAlertId(null);
        }
    }

    async function createInvestigationCase(alert) {
        const analyst = window.prompt(
            "Enter the analyst name:",
            "Zainab"
        );

        if (!analyst || !analyst.trim()) {
            return;
        }

        const summary = window.prompt(
            "Enter the investigation summary:",
            `Investigating Fraud Alert #${alert.id}`
        );

        if (!summary || !summary.trim()) {
            return;
        }

        try {
            setCreatingCaseAlertId(alert.id);
            setMessage("");
            setError("");

            const response = await fetch(
                `${API_URL}/cases`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        alert_id: alert.id,
                        assigned_analyst: analyst.trim(),
                        summary: summary.trim(),
                    }),
                }
            );

            if (!response.ok) {
                const errorData = await response.json();

                throw new Error(
                    errorData.detail ||
                    "Could not create investigation case"
                );
            }

            setMessage(
                `Investigation case created for Alert #${alert.id}`
            );
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setCreatingCaseAlertId(null);
        }
    }

    async function updateAlertStatus(alert, newStatus) {
        try {
            setUpdatingAlertStatusId(alert.id);
            setMessage("");
            setError("");

            const response = await fetch(
                `${API_URL}/alerts/${alert.id}/status`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        status: newStatus,
                        actor: "Zainab",
                    }),
                }
            );

            if (!response.ok) {
                const errorData = await response.json();

                const errorMessage =
                    typeof errorData.detail === "string"
                        ? errorData.detail
                        : JSON.stringify(errorData.detail);

                throw new Error(
                    errorMessage || "Could not update alert status"
                );
            }

            setAlerts((currentAlerts) =>
                currentAlerts.map((currentAlert) =>
                    currentAlert.id === alert.id
                        ? {
                            ...currentAlert,
                            status: newStatus,
                        }
                        : currentAlert
                )
            );

            setMessage(
                `Alert #${alert.id} changed to ${newStatus}`
            );
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setUpdatingAlertStatusId(null);
        }
    }

    return (
        <main className="main-content">
            <header className="dashboard-header">
                <div>
                    <p className="page-label">
                        Security Operations Center
                    </p>

                    <h1>Fraud Alerts</h1>

                    <p className="page-description">
                        Review and monitor suspicious banking
                        transactions.
                    </p>
                </div>
            </header>

            {loading && (
                <section className="content-panel">
                    <p>Loading fraud alerts...</p>
                </section>
            )}

            {error && (
                <section className="content-panel">
                    <p>{error}</p>
                </section>
            )}

            {!loading && !error && (
                <section className="content-panel">
                    {message && (
                        <p className="success-message">
                            {message}
                        </p>
                    )}
                    <div className="panel-header">
                        <div>
                            <h2>All Fraud Alerts</h2>
                            <p>
                                Showing {filteredAlerts.length} of {alerts.length} alerts
                            </p>
                        </div>
                    </div>

                    <div className="alert-filters">
                        <label>
                            Severity

                            <select
                                value={severityFilter}
                                onChange={(event) =>
                                    setSeverityFilter(event.target.value)
                                }
                            >
                                <option value="ALL">All severities</option>
                                <option value="LOW">Low</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="HIGH">High</option>
                                <option value="CRITICAL">Critical</option>
                            </select>
                        </label>

                        <label>
                            Status

                            <select
                                value={statusFilter}
                                onChange={(event) =>
                                    setStatusFilter(event.target.value)
                                }
                            >
                                <option value="ALL">All statuses</option>

                                {availableStatuses.map((status) => (
                                    <option key={status} value={status}>
                                        {status.replaceAll("_", " ")}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {filteredAlerts.length === 0 ? (
                        <div className="empty-state">
                            <h3>No fraud alerts found</h3>
                            <p>
                                Suspicious transactions will appear here.
                            </p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="alerts-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Amount</th>
                                        <th>Risk</th>
                                        <th>Severity</th>
                                        <th>Decision</th>
                                        <th>Status</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {filteredAlerts.map((alert) => (
                                        <tr key={alert.id}>
                                            <td>#{alert.id}</td>

                                            <td>
                                                ${Number(
                                                    alert.amount
                                                ).toLocaleString()}
                                            </td>

                                            <td>{alert.risk_score}/100</td>

                                            <td>
                                                <span
                                                    className={`severity-badge ${alert.severity.toLowerCase()}`}
                                                >
                                                    {alert.severity}
                                                </span>
                                            </td>

                                            <td>{alert.decision}</td>
                                            <td>
                                                <select
                                                    className="case-status-select"
                                                    value={alert.status}
                                                    disabled={
                                                        updatingAlertStatusId === alert.id
                                                    }
                                                    onChange={(event) =>
                                                        updateAlertStatus(
                                                            alert,
                                                            event.target.value
                                                        )
                                                    }
                                                >
                                                    <option value="NEW">New</option>

                                                    <option value="INVESTIGATING">
                                                        Investigating
                                                    </option>

                                                    <option value="RESOLVED">
                                                        Resolved
                                                    </option>


                                                </select>

                                                {updatingAlertStatusId === alert.id && (
                                                    <span className="updating-text">
                                                        Saving...
                                                    </span>
                                                )}
                                            </td>

                                            <td>
                                                {new Date(
                                                    alert.created_at
                                                ).toLocaleDateString()}
                                            </td>
                                            <td>
                                                <div className="action-buttons">
                                                    <button
                                                        className="secondary-button"
                                                        disabled={savingAlertId === alert.id}
                                                        onClick={() => addAnalystNote(alert)}
                                                    >
                                                        {savingAlertId === alert.id
                                                            ? "Saving..."
                                                            : "Add Note"}
                                                    </button>

                                                    <button
                                                        className="primary-button"
                                                        disabled={creatingCaseAlertId === alert.id}
                                                        onClick={() =>
                                                            createInvestigationCase(alert)
                                                        }
                                                    >
                                                        {creatingCaseAlertId === alert.id
                                                            ? "Creating..."
                                                            : "Create Case"}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}
        </main>
    );
}

export default FraudAlertsPage;