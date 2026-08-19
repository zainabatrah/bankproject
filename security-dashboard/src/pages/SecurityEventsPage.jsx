import { useEffect, useState } from "react";

const API_URL = "http://127.0.0.1:8001";

function SecurityEventsPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadEvents() {
      try {
        const response = await fetch(
          `${API_URL}/security-events`
        );

        if (!response.ok) {
          throw new Error("Could not load events");
        }

        const data = await response.json();
        setEvents(data);
      } catch {
        setError("Could not connect to FastAPI");
      } finally {
        setLoading(false);
      }
    }

    loadEvents();
  }, []);

  return (
    <main className="main-content">
      <header className="dashboard-header">
        <div>
          <p className="page-label">
            Security Operations Center
          </p>

          <h1>Security Events</h1>

          <p className="page-description">
            Monitor authentication, device and transaction
            security activity.
          </p>
        </div>
      </header>

      <section className="content-panel">
        {loading && <p>Loading security events...</p>}

        {error && <p>{error}</p>}

        {!loading && !error && (
          <>
            <div className="panel-header">
              <div>
                <h2>Recorded Events</h2>
                <p>{events.length} security events found</p>
              </div>
            </div>

            {events.length === 0 ? (
              <div className="empty-state">
                <h3>No security events found</h3>
                <p>
                  Detected security activity will appear
                  here.
                </p>
              </div>
            ) : (
              <div className="table-container">
                <table className="alerts-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Event Type</th>
                      <th>Severity</th>
                      <th>Description</th>
                      <th>Created</th>
                    </tr>
                  </thead>

                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td>#{event.id}</td>

                        <td>
                          {event.event_type.replaceAll(
                            "_",
                            " "
                          )}
                        </td>

                        <td>
                          <span
                            className={`severity-badge ${event.severity.toLowerCase()}`}
                          >
                            {event.severity}
                          </span>
                        </td>

                        <td>
                          {event.description ||
                            "Security event detected"}
                        </td>

                        <td>
                          {new Date(
                            event.created_at
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

export default SecurityEventsPage;