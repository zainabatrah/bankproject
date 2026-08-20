const API_URL = "http://127.0.0.1:8001";

function ReportsPage() {
  function downloadAlertCsv() {
    window.open(
      `${API_URL}/reports/alerts.csv`,
      "_blank"
    );
  }

  function downloadSecurityPdf() {
    window.open(
      `${API_URL}/reports/security-report.pdf`,
      "_blank"
    );
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
            onClick={downloadAlertCsv}
          >
            Download CSV
          </button>
        </article>

        <article className="report-card">
          <div className="report-icon pdf">PDF</div>

          <h2>Security Summary Report</h2>

          <p>
            Download a formatted PDF containing security
            statistics and recent fraud alerts.
          </p>

          <button
            className="primary-button"
            onClick={downloadSecurityPdf}
          >
            Download PDF
          </button>
        </article>
      </section>
    </main>
  );
}

export default ReportsPage;