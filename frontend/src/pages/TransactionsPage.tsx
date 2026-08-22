import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Download, Filter, ReceiptText, Search, SlidersHorizontal } from 'lucide-react'
import { Badge, EmptyState, ErrorState, LoadingState, Modal, PageHeader } from '../components/ui'
import { useBankData } from '../context/BankDataContext'
import { formatDate, formatMoney, titleCase } from '../lib/format'
import type { Transaction } from '../types'

export function TransactionsPage() {
  const { accounts, transactions, loading, error, reload } = useBankData()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')
  const [direction, setDirection] = useState('ALL')
  const [selected, setSelected] = useState<Transaction | null>(null)
  const accountIds = useMemo(() => new Set(accounts.map((account) => account.id)), [accounts])

  const filtered = useMemo(() => transactions.filter((transaction) => {
    const outgoing = Boolean(transaction.senderAccountId && accountIds.has(transaction.senderAccountId))
    const searchMatch = `${transaction.description ?? ''} ${transaction.reference} ${transaction.amount}`.toLowerCase().includes(search.toLowerCase())
    const statusMatch = status === 'ALL' || transaction.status === status
    const directionMatch = direction === 'ALL' || (direction === 'OUT' ? outgoing : !outgoing)
    return searchMatch && statusMatch && directionMatch
  }), [accountIds, direction, search, status, transactions])

  if (loading) return <LoadingState label="Loading your transaction history" />
  if (error && !transactions.length) return <ErrorState message={error} onRetry={reload} />

  function outgoing(transaction: Transaction) {
    return Boolean(transaction.senderAccountId && accountIds.has(transaction.senderAccountId))
  }

  function exportCsv() {
    const rows = [
      ['Reference', 'Date', 'Description', 'Direction', 'Amount', 'Currency', 'Status'],
      ...filtered.map((transaction) => [transaction.reference, transaction.createdAt, transaction.description ?? '', outgoing(transaction) ? 'Outgoing' : 'Incoming', String(transaction.amount), transaction.currency, transaction.status]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    link.download = `bankshield-transactions-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="page-stack">
      <PageHeader
        actions={<button className="button button--secondary" disabled={!filtered.length} onClick={exportCsv} type="button"><Download size={17} /> Export CSV</button>}
        description="Search, filter, and review all movements across your accounts."
        eyebrow="Account activity"
        title="Transactions"
      />

      <section className="panel table-panel">
        <div className="table-toolbar">
          <label className="search-field"><Search size={18} /><input aria-label="Search transactions" onChange={(event) => setSearch(event.target.value)} placeholder="Search reference or description" value={search} /></label>
          <div className="table-toolbar__filters">
            <label><Filter size={16} /><select aria-label="Filter by status" onChange={(event) => setStatus(event.target.value)} value={status}><option value="ALL">All statuses</option><option value="COMPLETED">Completed</option><option value="PENDING">Pending</option><option value="FLAGGED">Flagged</option><option value="REJECTED">Rejected</option></select></label>
            <label><SlidersHorizontal size={16} /><select aria-label="Filter by direction" onChange={(event) => setDirection(event.target.value)} value={direction}><option value="ALL">All activity</option><option value="OUT">Money out</option><option value="IN">Money in</option></select></label>
          </div>
        </div>

        {filtered.length ? (
          <div className="data-table-wrap">
            <table className="data-table transactions-table">
              <thead><tr><th>Transaction</th><th>Date</th><th>Reference</th><th>Status</th><th className="align-right">Amount</th></tr></thead>
              <tbody>
                {filtered.map((transaction) => {
                  const isOutgoing = outgoing(transaction)
                  return (
                    <tr key={transaction.id} onClick={() => setSelected(transaction)}>
                      <td><span className={`transaction-mark ${isOutgoing ? 'transaction-mark--out' : 'transaction-mark--in'}`}>{isOutgoing ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}</span><span className="cell-primary"><strong>{transaction.description || (isOutgoing ? 'Money transfer' : 'Incoming transfer')}</strong><small>{isOutgoing ? 'Sent payment' : 'Received payment'}</small></span></td>
                      <td><span className="cell-primary"><strong>{formatDate(transaction.createdAt)}</strong><small>{new Date(transaction.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</small></span></td>
                      <td className="mono-cell">{transaction.reference.slice(0, 18)}{transaction.reference.length > 18 ? '…' : ''}</td>
                      <td><Badge value={transaction.status} /></td>
                      <td className={`align-right amount-cell ${isOutgoing ? '' : 'money-in'}`}>{isOutgoing ? '−' : '+'}{formatMoney(transaction.amount, transaction.currency)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState description={transactions.length ? 'Try changing your search or filters.' : 'Your account activity will appear here once you make a transfer.'} icon={<ReceiptText size={25} />} title={transactions.length ? 'No matching transactions' : 'No transactions yet'} />
        )}
        {filtered.length > 0 && <div className="table-footer"><span>Showing {filtered.length} of {transactions.length} transactions</span><span>Newest first</span></div>}
      </section>

      {selected && (
        <Modal description="A complete record of this account movement." onClose={() => setSelected(null)} title="Transaction details">
          <div className="modal__body transaction-detail">
            <div className={`transaction-detail__amount ${outgoing(selected) ? '' : 'money-in'}`}><span>{outgoing(selected) ? 'Money sent' : 'Money received'}</span><strong>{outgoing(selected) ? '−' : '+'}{formatMoney(selected.amount, selected.currency)}</strong><Badge value={selected.status} /></div>
            <dl className="detail-list">
              <div><dt>Description</dt><dd>{selected.description || 'Money transfer'}</dd></div>
              <div><dt>Date & time</dt><dd>{formatDate(selected.createdAt, true)}</dd></div>
              <div><dt>Reference</dt><dd className="mono-cell">{selected.reference}</dd></div>
              <div><dt>Direction</dt><dd>{outgoing(selected) ? 'Outgoing' : 'Incoming'}</dd></div>
              <div><dt>Risk level</dt><dd>{selected.riskLevel ? <Badge value={selected.riskLevel} /> : 'Not available'}</dd></div>
              <div><dt>Risk score</dt><dd>{selected.riskScore ?? 'Not available'}</dd></div>
              <div><dt>Type</dt><dd>{titleCase(selected.type)}</dd></div>
            </dl>
            <div className="modal__actions"><button className="button button--primary" onClick={() => setSelected(null)} type="button">Done</button></div>
          </div>
        </Modal>
      )}
    </div>
  )
}
