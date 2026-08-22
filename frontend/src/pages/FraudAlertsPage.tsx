import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Clock3, Search, ShieldAlert, ShieldCheck, UserRound, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, EmptyState, ErrorState, LoadingState, Modal, PageHeader } from '../components/ui'
import { useBankData } from '../context/BankDataContext'
import { formatDate, formatMoney, initials, maskAccount, relativeTime } from '../lib/format'
import type { AlertStatus, FraudAlert } from '../types'

const statuses: AlertStatus[] = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE']

export function FraudAlertsPage() {
  const { alerts, loading, error, reload, updateAlertStatus } = useBankData()
  const [search, setSearch] = useState('')
  const [risk, setRisk] = useState('ALL')
  const [status, setStatus] = useState('ALL')
  const [selected, setSelected] = useState<FraudAlert | null>(null)
  const [updating, setUpdating] = useState(false)

  const filtered = useMemo(() => alerts.filter((alert) => {
    const customer = alert.transaction.senderAccount?.user
    const haystack = `${alert.transaction.reference} ${alert.reason} ${customer?.firstName ?? ''} ${customer?.lastName ?? ''} ${customer?.email ?? ''}`.toLowerCase()
    return haystack.includes(search.toLowerCase()) && (risk === 'ALL' || alert.riskLevel === risk) && (status === 'ALL' || alert.status === status)
  }), [alerts, risk, search, status])

  if (loading) return <LoadingState label="Loading the fraud alert queue" />
  if (error && !alerts.length) return <ErrorState message={error} onRetry={reload} />

  async function changeStatus(nextStatus: AlertStatus) {
    if (!selected || selected.status === nextStatus) return
    setUpdating(true)
    try {
      const response = await updateAlertStatus(selected.id, nextStatus)
      setSelected((current) => current ? { ...current, status: response.alert.status, updatedAt: response.alert.updatedAt } : null)
      toast.success(`Alert #${selected.id} marked ${nextStatus.toLowerCase().replace('_', ' ')}`)
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : 'Could not update this alert')
    } finally {
      setUpdating(false)
    }
  }

  const openCount = alerts.filter((alert) => alert.status === 'OPEN').length
  const criticalCount = alerts.filter((alert) => alert.riskLevel === 'CRITICAL').length
  const reviewingCount = alerts.filter((alert) => alert.status === 'INVESTIGATING').length
  const closedCount = alerts.filter((alert) => ['RESOLVED', 'FALSE_POSITIVE'].includes(alert.status)).length

  return (
    <div className="page-stack ops-page">
      <PageHeader description="Prioritize suspicious payments and document every investigation decision." eyebrow="Fraud operations" title="Fraud alerts" />

      <section className="ops-kpi-grid">
        <article><span className="ops-kpi__icon ops-kpi__icon--red"><ShieldAlert size={20} /></span><div><small>Open alerts</small><strong>{openCount}</strong><p>Awaiting review</p></div></article>
        <article><span className="ops-kpi__icon ops-kpi__icon--orange"><AlertTriangle size={20} /></span><div><small>Critical risk</small><strong>{criticalCount}</strong><p>Score 80 or higher</p></div></article>
        <article><span className="ops-kpi__icon ops-kpi__icon--blue"><Clock3 size={20} /></span><div><small>Investigating</small><strong>{reviewingCount}</strong><p>Active cases</p></div></article>
        <article><span className="ops-kpi__icon ops-kpi__icon--green"><ShieldCheck size={20} /></span><div><small>Closed</small><strong>{closedCount}</strong><p>Resolved or cleared</p></div></article>
      </section>

      <section className="panel table-panel">
        <div className="table-toolbar">
          <label className="search-field"><Search size={18} /><input aria-label="Search alerts" onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, reference, or reason" value={search} /></label>
          <div className="table-toolbar__filters">
            <label><select aria-label="Filter by risk" onChange={(event) => setRisk(event.target.value)} value={risk}><option value="ALL">All risk levels</option><option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></label>
            <label><select aria-label="Filter by status" onChange={(event) => setStatus(event.target.value)} value={status}><option value="ALL">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}</select></label>
          </div>
        </div>

        {filtered.length ? (
          <div className="data-table-wrap">
            <table className="data-table alerts-ops-table">
              <thead><tr><th>Risk</th><th>Customer</th><th>Transaction</th><th>Triggers</th><th>Status</th><th>Detected</th><th /></tr></thead>
              <tbody>{filtered.map((alert) => {
                const customer = alert.transaction.senderAccount?.user
                return (
                  <tr key={alert.id} onClick={() => setSelected(alert)}>
                    <td><span className={`risk-score risk-score--${alert.riskLevel.toLowerCase()}`}><strong>{alert.riskScore}</strong><small>/100</small></span></td>
                    <td><div className="user-cell"><span className="mini-avatar">{initials(customer?.firstName, customer?.lastName)}</span><span className="cell-primary"><strong>{customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown customer'}</strong><small>{customer?.email ?? 'No email available'}</small></span></div></td>
                    <td><span className="cell-primary"><strong>{formatMoney(alert.transaction.amount, alert.transaction.currency)}</strong><small className="mono-cell">{alert.transaction.reference.slice(0, 17)}</small></span></td>
                    <td><span className="reason-cell">{alert.reason.split(';')[0]}</span></td>
                    <td><Badge value={alert.status} /></td>
                    <td><span className="cell-primary"><strong>{relativeTime(alert.createdAt)}</strong><small>{formatDate(alert.createdAt, true)}</small></span></td>
                    <td><button aria-label={`Review alert ${alert.id}`} className="icon-button" type="button"><ArrowRight size={16} /></button></td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        ) : <EmptyState description={alerts.length ? 'Try changing the queue filters.' : 'Flagged transactions will appear here automatically.'} icon={<ShieldCheck size={25} />} title={alerts.length ? 'No matching alerts' : 'The queue is clear'} />}
        {filtered.length > 0 && <div className="table-footer"><span>{filtered.length} alerts in this view</span><span>Ordered by newest</span></div>}
      </section>

      {selected && (
        <Modal description={`Alert #${selected.id} · ${selected.transaction.reference}`} onClose={() => setSelected(null)} title="Review fraud alert" wide>
          <div className="modal__body alert-review">
            <section className="alert-review__summary">
              <div className={`risk-orb risk-orb--${selected.riskLevel.toLowerCase()}`}><strong>{selected.riskScore}</strong><span>risk score</span></div>
              <div><Badge value={selected.riskLevel} /><h3>{selected.riskLevel === 'CRITICAL' ? 'Immediate review recommended' : 'Transaction requires review'}</h3><p>{selected.reason}</p></div>
            </section>

            <div className="alert-review__grid">
              <section><h3><UserRound size={16} /> Sender</h3><dl className="detail-list"><div><dt>Customer</dt><dd>{selected.transaction.senderAccount?.user ? `${selected.transaction.senderAccount.user.firstName} ${selected.transaction.senderAccount.user.lastName}` : 'Unavailable'}</dd></div><div><dt>Email</dt><dd>{selected.transaction.senderAccount?.user.email ?? 'Unavailable'}</dd></div><div><dt>Account</dt><dd>{selected.transaction.senderAccount ? maskAccount(selected.transaction.senderAccount.accountNumber) : 'Unavailable'}</dd></div><div><dt>Account status</dt><dd>{selected.transaction.senderAccount?.user.status ? <Badge value={selected.transaction.senderAccount.user.status} /> : 'Unavailable'}</dd></div></dl></section>
              <section><h3><ShieldAlert size={16} /> Transaction</h3><dl className="detail-list"><div><dt>Amount</dt><dd>{formatMoney(selected.transaction.amount, selected.transaction.currency)}</dd></div><div><dt>Description</dt><dd>{selected.transaction.description || 'No description'}</dd></div><div><dt>Detected</dt><dd>{formatDate(selected.createdAt, true)}</dd></div><div><dt>Reference</dt><dd className="mono-cell">{selected.transaction.reference.slice(0, 20)}</dd></div></dl></section>
            </div>

            <section className="alert-decision"><div><h3>Investigation decision</h3><p>Every status change is written to the immutable audit log.</p></div><div className="alert-decision__options">{statuses.map((item) => <button className={selected.status === item ? 'active' : ''} disabled={updating} key={item} onClick={() => changeStatus(item)} type="button">{item === 'RESOLVED' ? <ShieldCheck size={15} /> : item === 'FALSE_POSITIVE' ? <XCircle size={15} /> : item === 'INVESTIGATING' ? <Clock3 size={15} /> : <AlertTriangle size={15} />}{item.replace('_', ' ')}</button>)}</div></section>
          </div>
        </Modal>
      )}
    </div>
  )
}
