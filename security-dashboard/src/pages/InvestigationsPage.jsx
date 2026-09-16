import { useEffect, useState } from "react";
import { socApi } from "../api";

function InvestigationsPage() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingCaseId, setUpdatingCaseId] =
    useState(null);

  useEffect(() => {
    async function loadCases() {
      try {
        const data = await socApi.getCases();
        setCases(Array.isArray(data) ? data : []);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    }

    loadCases();
  }, []);

  async function updateCaseStatus(item, newStatus) {
    try {
      setUpdatingCaseId(item.id);
      setError("");

      await socApi.updateCaseStatus(item.id, newStatus);

      setCases((currentCases) =>
        currentCases.map((currentCase) =>
          currentCase.id === item.id
            ? {
                ...currentCase,
                status: newStatus,
                outcome:
                  newStatus === "RESOLVED" ||
                  newStatus === "FALSE_POSITIVE"
                    ? newStatus
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

                            <option value="INVESTIGATING">
                              Investigating
                            </option>

                            <option value="RESOLVED">
                              Resolved
                            </option>

                            <option value="FALSE_POSITIVE">
                              False positive
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
