import { useEffect, useState } from "react"
import { socApi } from "../api"


function NotificationsPage() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [markingId, setMarkingId] = useState(null)

  useEffect(() => {
    async function loadNotifications() {
      try {
        const data = await socApi.getNotifications(true)
        setNotifications(Array.isArray(data) ? data : [])
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load notifications"
        )
      } finally {
        setLoading(false)
      }
    }

    loadNotifications()
  }, [])

  async function markAsRead(notificationId) {
    try {
      setMarkingId(notificationId)
      setError("")

      await socApi.markNotificationRead(notificationId)

      setNotifications((currentNotifications) =>
        currentNotifications.filter(
          (notification) =>
            notification.id !== notificationId
        )
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update notification"
      )
    } finally {
      setMarkingId(null)
    }
  }

  return (
    <main className="main-content">
      <header className="dashboard-header">
        <div>
          <p className="page-label">
            Security Operations Center
          </p>

          <h1>Critical Notifications</h1>

          <p className="page-description">
            Review unread notifications for critical fraud
            alerts.
          </p>
        </div>
      </header>

      {loading && (
        <section className="content-panel">
          <p>Loading notifications...</p>
        </section>
      )}

      {error && (
        <section className="content-panel">
          <p className="error-message">{error}</p>
        </section>
      )}

      {!loading && !error && notifications.length === 0 && (
        <section className="content-panel">
          <h2>No unread notifications</h2>
          <p>All critical alerts have been reviewed.</p>
        </section>
      )}

      {!loading && notifications.length > 0 && (
        <section className="content-panel">
          <h2>
            Unread notifications ({notifications.length})
          </h2>

          {notifications.map((notification) => (
            <article
              className="report-card"
              key={notification.id}
            >
              <h3>{notification.title}</h3>
              <p>{notification.message}</p>
              <p>
                {new Date(
                  notification.created_at
                ).toLocaleString()}
              </p>

              <button
                className="primary-button"
                disabled={markingId === notification.id}
                onClick={() =>
                  markAsRead(notification.id)
                }
              >
                {markingId === notification.id
                  ? "Updating..."
                  : "Mark as Read"}
              </button>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}


export default NotificationsPage