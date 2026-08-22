import { useMemo, useState } from 'react'
import { CheckCircle2, Download, FileClock, Search, ShieldCheck } from 'lucide-react'
import { Badge, EmptyState, ErrorState, LoadingState, Modal, PageHeader } from '../components/ui'
import { useBankData } from '../context/BankDataContext'
import { formatDate, initials, titleCase } from '../lib/format'
import type { AuditLog } from '../types'

export function AuditLogsPage() {
  const { auditLogs, loading, error, reload } = useBankData()
  const [search, setSearch] = useState('')
  const [resultFilter, setResultFilter] = useState('ALL')
  const [selected, setSelected] = useState<AuditLog | null>(null)

  const filtered = useMemo(() => auditLogs.filter((log) => {
    const haystack = `${log.action} ${log.resource ?? ''} ${log.user?.email ?? ''} ${log.user?.firstName ?? ''} ${log.user?.lastName ?? ''}`.toLowerCase()
    return haystack.includes(search.toLowerCase()) && (resultFilter === 'ALL' || log.result === resultFilter)
  }), [auditLogs, resultFilter, search])

  if (loading) return <LoadingState label="Loading the audit trail" />
  if (error && !auditLogs.length) return <ErrorState message={error} onRetry={reload} />

  function parsedDetails(log: AuditLog) {
    if (!log.details) return null
    try { return JSON.parse(log.details) as Record<string, unknown> } catch { return { details: log.details } }
  }

  function exportCsv() {
    const rows = [['ID', 'Time', 'Actor', 'Action', 'Resource', 'Result'], ...filtered.map((log) => [String(log.id), log.createdAt, log.user?.email ?? '', log.action, log.resource ?? '', log.result ?? ''])]
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = `bankshield-audit-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href)
  }

  return (
    <div className="page-stack ops-page">
      <PageHeader actions={<button className="button button--secondary" disabled={!filtered.length} onClick={exportCsv} type="button"><Download size={17} /> Export log</button>} description="A chronological, traceable record of sensitive actions across BankShield." eyebrow="Security operations" title="Audit logs" />
      <div className="audit-integrity"><span><ShieldCheck size={20} /></span><div><strong>Audit integrity active</strong><p>Administrative and fraud-review actions are recorded with actor, result, and timestamp.</p></div><Badge tone="success" value="Verified" /></div>
      <section className="panel table-panel">
        <div className="table-toolbar"><label className="search-field"><Search size={18} /><input aria-label="Search audit logs" onChange={(event) => setSearch(event.target.value)} placeholder="Search actor, action, or resource" value={search} /></label><div className="table-toolbar__filters"><label><select aria-label="Filter result" onChange={(event) => setResultFilter(event.target.value)} value={resultFilter}><option value="ALL">All results</option><option value="SUCCESS">Success</option><option value="FAILED">Failed</option><option value="REVIEW_REQUIRED">Review required</option></select></label></div></div>
        {filtered.length ? <div className="data-table-wrap"><table className="data-table audit-table"><thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Resource</th><th>Result</th><th /></tr></thead><tbody>{filtered.map((log) => <tr key={log.id} onClick={() => setSelected(log)}><td><span className="cell-primary"><strong>{formatDate(log.createdAt, true)}</strong><small>Event #{log.id}</small></span></td><td><div className="user-cell"><span className="mini-avatar">{initials(log.user?.firstName, log.user?.lastName)}</span><span className="cell-primary"><strong>{log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System'}</strong><small>{log.user?.email ?? 'Automated action'}</small></span></div></td><td><span className="action-label">{titleCase(log.action)}</span></td><td className="mono-cell">{log.resource || '—'}</td><td><Badge tone={log.result === 'SUCCESS' ? 'success' : log.result === 'FAILED' ? 'danger' : 'warning'} value={log.result || 'UNKNOWN'} /></td><td><button aria-label={`View audit event ${log.id}`} className="icon-button" type="button"><FileClock size={15} /></button></td></tr>)}</tbody></table></div> : <EmptyState description={auditLogs.length ? 'Try another search or result filter.' : 'Security-sensitive activity will be recorded here.'} icon={<FileClock size={25} />} title={auditLogs.length ? 'No matching events' : 'No audit events'} />}
        {filtered.length > 0 && <div className="table-footer"><span>{filtered.length} immutable events</span><span>Newest first</span></div>}
      </section>

      {selected && <Modal description={`Audit event #${selected.id}`} onClose={() => setSelected(null)} title="Event details"><div className="modal__body audit-detail"><div className="audit-detail__hero"><span><CheckCircle2 size={22} /></span><div><Badge tone={selected.result === 'SUCCESS' ? 'success' : 'warning'} value={selected.result || 'UNKNOWN'} /><h3>{titleCase(selected.action)}</h3><p>{formatDate(selected.createdAt, true)}</p></div></div><dl className="detail-list"><div><dt>Actor</dt><dd>{selected.user ? `${selected.user.firstName} ${selected.user.lastName}` : 'System'}</dd></div><div><dt>Actor role</dt><dd>{selected.user ? titleCase(selected.user.role) : 'Automated process'}</dd></div><div><dt>Resource</dt><dd className="mono-cell">{selected.resource || 'None'}</dd></div><div><dt>User ID</dt><dd>{selected.userId ?? 'None'}</dd></div></dl><section className="audit-detail__payload"><h4>Recorded details</h4>{parsedDetails(selected) ? <pre>{JSON.stringify(parsedDetails(selected), null, 2)}</pre> : <p>No additional payload was recorded.</p>}</section><div className="modal__actions"><button className="button button--primary" onClick={() => setSelected(null)} type="button">Done</button></div></div></Modal>}
    </div>
  )
}
