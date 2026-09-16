import { useState } from "react";
import { socApi } from "../api";

function ReportsPage() {
  const [downloading, setDownloading] = useState("");
  const [error, setError] = useState("");

  async function downloadReport(name, download) {
    try {
      setDownloading(name);
      setError("");
      await download();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not download report",
      );
    } finally {
      setDownloading("");
    }
  }

  return (
    <main className="main-content">
      <header className="dashboard-header">
        <div>
          <p className="page-label">
            Security Operations Center
          </p>

          <h1>Security Reports</h1>

          <p className="page-description">
            Export fraud alerts and security analysis for
            documentation and review.
          </p>
        </div>
      </header>

      {error && <section className="content-panel"><p className="error-message">{error}</p></section>}

      <section className="reports-grid">
        <article className="report-card">
          <div className="report-icon">CSV</div>

          <h2>Fraud Alerts Report</h2>

          <p>
            Download all fraud alerts with their amounts,
            risk scores, severity, decisions and status.
          </p>

          <button
            className="primary-button"
            disabled={downloading === "csv"}
            onClick={() => downloadReport("csv", socApi.downloadAlertsCsv)}
          >
            {downloading === "csv" ? "Downloading..." : "Download CSV"}
          </button>
        </article>

        <article className="report-card">
          <div className="report-icon pdf">JSON</div>

          <h2>Security Summary Report</h2>

          <p>
            Download a machine-readable report containing
            current security statistics and alert analysis.
          </p>

          <button
            className="primary-button"
            disabled={downloading === "security"}
            onClick={() =>
              downloadReport("security", socApi.downloadSecurityReport)
            }
          >
            {downloading === "security" ? "Downloading..." : "Download JSON"}
          </button>
        </article>
      </section>
    </main>
  );
}

export default ReportsPage;
