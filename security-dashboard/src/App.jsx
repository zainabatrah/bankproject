import "./App.css";
import SecurityEventsChart from "./components/SecurityEventsChart";
import InvestigationsPage from "./pages/InvestigationsPage";
import SecurityEventsPage from "./pages/SecurityEventsPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import ReportsPage from "./pages/ReportsPage";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useEffect, useState } from "react";
import "./App.css";
import { useLocation, useNavigate } from "react-router";
import FraudAlertsPage from "./pages/FraudAlertsPage";

const API_URL = "http://127.0.0.1:8001";

function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const showingDashboard =
    location.pathname === "/";

  const showingAlertsPage =
    location.pathname === "/alerts";

  const showingInvestigationsPage =
    location.pathname === "/investigations";

  const showingSecurityEventsPage =
    location.pathname === "/security-events";

  const showingAuditLogsPage =
    location.pathname === "/audit-logs";

  const showingReportsPage =
    location.pathname === "/reports";

  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [riskData, setRiskData] = useState([]);
  const [alertsPerDay, setAlertsPerDay] = useState([]);
  const [error, setError] = useState("");
  const [caseStatusData, setCaseStatusData] =
    useState([]);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [
          summaryResponse,
          alertsResponse,
          riskResponse,
          dailyAlertsResponse,
          caseStatusResponse,
        ] = await Promise.all([
          fetch(`${API_URL}/analytics/summary`),
          fetch(`${API_URL}/alerts`),
          fetch(
            `${API_URL}/analytics/risk-distribution`
          ),
          fetch(`${API_URL}/analytics/alerts-per-day`),
          fetch(`${API_URL}/analytics/cases-by-status`),
        ]);

        if (
          !summaryResponse.ok ||
          !alertsResponse.ok ||
          !riskResponse.ok ||
          !dailyAlertsResponse.ok ||
          !caseStatusResponse.ok
        ) {
          throw new Error("Could not load dashboard");
        }

        const summaryData =
          await summaryResponse.json();

        const alertsData =
          await alertsResponse.json();

        const riskDistribution =
          await riskResponse.json();

        const dailyAlerts =
          await dailyAlertsResponse.json();

        const caseStatuses =
          await caseStatusResponse.json();
        const caseColors = {
          OPEN: "#ef4444",
          IN_PROGRESS: "#eab308",
          CLOSED: "#22c55e",
        };

        const formattedCaseData = Object.entries(
          caseStatuses
        ).map(([status, count]) => ({
          status: status.replace("_", " "),
          count,
          color: caseColors[status],
        }));

        setAlertsPerDay(dailyAlerts);
        setCaseStatusData(formattedCaseData);

        const colors = {
          LOW: "#22c55e",
          MEDIUM: "#eab308",
          HIGH: "#f97316",
          CRITICAL: "#ef4444",
        };

        const formattedRiskData = Object.entries(
          riskDistribution
        ).map(([severity, count]) => ({
          severity,
          count,
          color: colors[severity],
        }));

        setSummary(summaryData);
        setAlerts(alertsData.slice(0, 5));
        setRiskData(formattedRiskData);
      } catch {
        setError("FastAPI connection failed");
      }
    }

    loadDashboard();
  }, []);

  const summaryCards = [
    {
      title: "Total Alerts",
      value: summary?.total_alerts ?? "—",
    },
    {
      title: "Critical Alerts",
      value: summary?.critical_alerts ?? "—",
    },
    {
      title: "Open Cases",
      value: summary?.open_cases ?? "—",
    },
    {
      title: "Security Events",
      value: summary?.total_security_events ?? "—",
    },
  ];

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="brand">
          <h2>BankShield</h2>
          <span>Security Operations</span>
        </div>

        <nav>
          <button
            className={`nav-item ${showingDashboard ? "active" : ""
              }`}
            onClick={() => navigate("/")}
          >
            Dashboard
          </button>

          <button
            className={`nav-item ${showingAlertsPage ? "active" : ""
              }`}
            onClick={() => navigate("/alerts")}
          >
            Fraud Alerts
          </button>

          <button
            className={`nav-item ${showingInvestigationsPage ? "active" : ""
              }`}
            onClick={() => navigate("/investigations")}
          >
            Investigations
          </button>

          <button
            className={`nav-item ${showingSecurityEventsPage ? "active" : ""
              }`}
            onClick={() => navigate("/security-events")}
          >
            Security Events
          </button>

          <button
            className={`nav-item ${showingAuditLogsPage ? "active" : ""
              }`}
            onClick={() => navigate("/audit-logs")}
          >
            Audit Logs
          </button>

          <button
            className={`nav-item ${showingReportsPage ? "active" : ""
              }`}
            onClick={() => navigate("/reports")}
          >
            Reports
          </button>
        </nav>
      </aside>
      {showingAlertsPage ? (
        <FraudAlertsPage />
      ) : showingInvestigationsPage ? (
        <InvestigationsPage />
      ) : showingSecurityEventsPage ? (
        <SecurityEventsPage />
      ) : showingAuditLogsPage ? (
        <AuditLogsPage />
      ) : showingReportsPage ? (
        <ReportsPage />
      ) : (

        <main className="main-content">
          <header className="dashboard-header">
            <div>
              <p className="page-label">
                Security Operations Center
              </p>

              <h1>Fraud Monitoring Dashboard</h1>

              <p className="page-description">
                Monitor alerts, investigations and security
                events.
              </p>
            </div>

            <div
              className={`system-status ${error ? "error" : ""
                }`}
            >
              <span className="status-dot"></span>

              {error
                ? "Backend unavailable"
                : summary
                  ? "System operational"
                  : "Connecting..."}
            </div>
          </header>

          <section className="summary-grid">
            {summaryCards.map((card) => (
              <article
                className="summary-card"
                key={card.title}
              >
                <p>{card.title}</p>
                <strong>{card.value}</strong>
              </article>
            ))}
          </section>

          <section className="chart-panel">
            <div className="chart-header">
              <div>
                <h2>Risk Distribution</h2>
                <p>
                  Fraud alerts grouped by severity
                </p>
              </div>
            </div>

            <div className="chart-container">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={riskData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="severity"
                    tickLine={false}
                    axisLine={false}
                  />

                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                  />

                  <Tooltip />

                  <Bar
                    dataKey="count"
                    name="Alerts"
                    radius={[6, 6, 0, 0]}
                  >
                    {riskData.map((item) => (
                      <Cell
                        key={item.severity}
                        fill={item.color}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="chart-panel">
            <div className="chart-header">
              <div>
                <h2>Fraud Alerts per Day</h2>
                <p>
                  Number of generated fraud alerts each day
                </p>
              </div>
            </div>

            <div className="chart-container">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={alertsPerDay}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                  />

                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                  />

                  <Tooltip />

                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Fraud Alerts"
                    stroke="#1769e0"
                    strokeWidth={3}
                    dot={{
                      fill: "#1769e0",
                      strokeWidth: 2,
                      r: 5,
                    }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="chart-panel">
            <div className="chart-header">
              <div>
                <h2>Investigation Cases</h2>
                <p>Cases grouped by their current status</p>
              </div>
            </div>

            <div className="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={caseStatusData}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={105}
                    paddingAngle={4}
                  >
                    {caseStatusData.map((item) => (
                      <Cell
                        key={item.status}
                        fill={item.color}
                      />
                    ))}
                  </Pie>

                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>

          <SecurityEventsChart />

          <section className="content-panel">
            <div className="panel-header">
              <div>
                <h2>Recent Fraud Alerts</h2>
                <p>
                  Latest suspicious banking transactions
                </p>
              </div>

              <button className="primary-button">
                View all alerts
              </button>
            </div>

            {alerts.length === 0 ? (
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
                    </tr>
                  </thead>

                  <tbody>
                    {alerts.map((alert) => (
                      <tr key={alert.id}>
                        <td>#{alert.id}</td>

                        <td>
                          ${Number(alert.amount).toLocaleString()}
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
                        <td>{alert.status}</td>

                        <td>
                          {new Date(
                            alert.created_at
                          ).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}

export default App;