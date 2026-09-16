import { useEffect, useState } from "react";
import { socApi } from "../api";

function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadAuditLogs() {
      try {
        const data = await socApi.getAuditLogs();
        setLogs(Array.isArray(data) ? data : []);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load audit logs",
        );
      } finally {
        setLoading(false);
      }
    }

    loadAuditLogs();
  }, []);

  return (
    <main className="main-content">
      <header className="dashboard-header">
        <div>
          <p className="page-label">
            Security Operations Center
          </p>

          <h1>Audit Logs</h1>

          <p className="page-description">
            Review important actions performed by analysts
            and the security system.
          </p>
        </div>
      </header>

      <section className="content-panel">
        {loading && <p>Loading audit logs...</p>}

        {error && <p>{error}</p>}

        {!loading && !error && (
          <>
            <div className="panel-header">
              <div>
                <h2>Recorded Actions</h2>
                <p>{logs.length} audit records found</p>
              </div>
            </div>

            {logs.length === 0 ? (
              <div className="empty-state">
                <h3>No audit logs found</h3>
                <p>
                  Analyst and system actions will appear
                  here.
                </p>
              </div>
            ) : (
              <div className="table-container">
                <table className="alerts-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Action</th>
                      <th>Entity Type</th>
                      <th>Entity ID</th>
                      <th>Actor</th>
                      <th>Created</th>
                    </tr>
                  </thead>

                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td>#{log.id}</td>

                        <td>
                          {log.action.replaceAll("_", " ")}
                        </td>

                        <td>
                          {log.entity_type.replaceAll(
                            "_",
                            " "
                          )}
                        </td>

                        <td>
                          {log.entity_id
                            ? `#${log.entity_id}`
                            : "—"}
                        </td>

                        <td>{log.actor || "System"}</td>

                        <td>
                          {new Date(
                            log.created_at
                          ).toLocaleString()}
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

export default AuditLogsPage;
