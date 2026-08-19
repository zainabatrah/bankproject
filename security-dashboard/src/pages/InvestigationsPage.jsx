import { useEffect, useState } from "react";

const API_URL = "http://127.0.0.1:8001";

function InvestigationsPage() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingCaseId, setUpdatingCaseId] =
    useState(null);

  useEffect(() => {
    async function loadCases() {
      try {
        const response = await fetch(
          `${API_URL}/cases`
        );

        if (!response.ok) {
          throw new Error(
            "Could not load investigation cases"
          );
        }

        const data = await response.json();
        setCases(data);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    }

    loadCases();
  }, []);

  async function updateCaseStatus(item, newStatus) {
    let outcome = item.outcome;

    if (newStatus === "CLOSED" && !outcome) {
      outcome = window.prompt(
        "Enter outcome: CONFIRMED_FRAUD, FALSE_POSITIVE or INCONCLUSIVE"
      );

      if (!outcome) {
        return;
      }

      outcome = outcome.toUpperCase();
    }

    try {
      setUpdatingCaseId(item.id);
      setError("");

      const response = await fetch(
        `${API_URL}/cases/${item.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: newStatus,
            outcome:
              newStatus === "CLOSED" ? outcome : null,
            actor:
              item.assigned_analyst || "Fraud Analyst",
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();

        throw new Error(
          errorData.detail || "Could not update case"
        );
      }

      setCases((currentCases) =>
        currentCases.map((currentCase) =>
          currentCase.id === item.id
            ? {
                ...currentCase,
                status: newStatus,
                outcome:
                  newStatus === "CLOSED"
                    ? outcome
                    : null,
              }
            : currentCase
        )
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUpdatingCaseId(null);
    }
  }

  return (
    <main className="main-content">
      <header className="dashboard-header">
        <div>
          <p className="page-label">
            Security Operations Center
          </p>

          <h1>Investigation Cases</h1>

          <p className="page-description">
            Track fraud investigations and analyst work.
          </p>
        </div>
      </header>

      <section className="content-panel">
        {loading && (
          <p>Loading investigation cases...</p>
        )}

        {error && (
          <p className="error-message">{error}</p>
        )}

        {!loading && (
          <>
            <div className="panel-header">
              <div>
                <h2>All Cases</h2>
                <p>{cases.length} cases found</p>
              </div>
            </div>

            {cases.length === 0 ? (
              <div className="empty-state">
                <h3>No investigation cases found</h3>

                <p>
                  Cases created from fraud alerts will
                  appear here.
                </p>
              </div>
            ) : (
              <div className="table-container">
                <table className="alerts-table">
                  <thead>
                    <tr>
                      <th>Case ID</th>
                      <th>Alert ID</th>
                      <th>Status</th>
                      <th>Analyst</th>
                      <th>Summary</th>
                      <th>Outcome</th>
                      <th>Created</th>
                      <th>Change Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {cases.map((item) => (
                      <tr key={item.id}>
                        <td>#{item.id}</td>
                        <td>#{item.alert_id}</td>
                        <td>{item.status}</td>

                        <td>
                          {item.assigned_analyst ||
                            "Unassigned"}
                        </td>

                        <td>{item.summary}</td>

                        <td>
                          {item.outcome || "Pending"}
                        </td>

                        <td>
                          {new Date(
                            item.created_at
                          ).toLocaleDateString()}
                        </td>

                        <td>
                          <select
                            className="case-status-select"
                            value={item.status}
                            disabled={
                              updatingCaseId === item.id
                            }
                            onChange={(event) =>
                              updateCaseStatus(
                                item,
                                event.target.value
                              )
                            }
                          >
                            <option value="OPEN">
                              Open
                            </option>

                            <option value="IN_PROGRESS">
                              In Progress
                            </option>

                            <option value="CLOSED">
                              Closed
                            </option>
                          </select>

                          {updatingCaseId === item.id && (
                            <span className="updating-text">
                              Saving...
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default InvestigationsPage;