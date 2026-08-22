import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CreditCard,
  Eye,
  EyeOff,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBankData } from '../context/BankDataContext'
import { formatDate, formatMoney, maskAccount } from '../lib/format'
import type { Transaction } from '../types'
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui'

const balanceTrend = [
  { label: 'Mar', value: 22_840 },
  { label: 'Apr', value: 24_310 },
  { label: 'May', value: 23_740 },
  { label: 'Jun', value: 26_180 },
  { label: 'Jul', value: 25_650 },
  { label: 'Aug', value: 28_451 },
]

function TransactionMark({ outgoing }: { outgoing: boolean }) {
  return <span className={`transaction-mark ${outgoing ? 'transaction-mark--out' : 'transaction-mark--in'}`}>{outgoing ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}</span>
}

export function DashboardPage() {
  const { user } = useAuth()
  const { accounts, beneficiaries, transactions, loading, error, reload } = useBankData()
  const navigate = useNavigate()
  const [balancesVisible, setBalancesVisible] = useState(true)
  const primaryAccount = accounts[0]
  const accountIds = useMemo(() => new Set(accounts.map((account) => account.id)), [accounts])
  const outgoingThisMonth = transactions
    .filter((transaction) => transaction.senderAccountId === primaryAccount?.id)
    .reduce((total, transaction) => total + Number(transaction.amount), 0)
  const incomingThisMonth = transactions
    .filter((transaction) => transaction.receiverAccountId === primaryAccount?.id)
    .reduce((total, transaction) => total + Number(transaction.amount), 0)

  if (loading) return <LoadingState />
  if (error && !accounts.length) return <ErrorState message={error} onRetry={reload} />

  function isOutgoing(transaction: Transaction) {
    return Boolean(transaction.senderAccountId && accountIds.has(transaction.senderAccountId))
  }

  return (
    <div className="page-stack">
      <PageHeader
        actions={<button className="button button--primary" onClick={() => navigate('/transfer')} type="button"><Send size={17} /> Send money</button>}
        description="Here’s what’s happening with your money today."
        eyebrow="Personal banking"
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${user?.firstName}`}
      />

      <section className="dashboard-hero-grid">
        <article className="balance-hero">
          <div className="balance-hero__top">
            <span>Primary balance</span>
            <button aria-label={balancesVisible ? 'Hide balances' : 'Show balances'} onClick={() => setBalancesVisible((visible) => !visible)} type="button">{balancesVisible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
          {primaryAccount ? (
            <>
              <strong className="balance-hero__amount">{balancesVisible ? formatMoney(primaryAccount.balance, primaryAccount.currency) : '••••••'}</strong>
              <div className="balance-hero__account"><span>{primaryAccount.currency} Current account</span><small>{maskAccount(primaryAccount.accountNumber)}</small></div>
            </>
          ) : (
            <><strong className="balance-hero__amount">—</strong><div className="balance-hero__account"><span>No account yet</span><small>Open one to start banking</small></div></>
          )}
          <div className="balance-hero__actions">
            <button onClick={() => navigate('/transfer')} type="button"><span><Send size={18} /></span>Send</button>
            <button onClick={() => navigate('/accounts')} type="button"><span><Plus size={18} /></span>New account</button>
            <button onClick={() => navigate('/beneficiaries')} type="button"><span><UsersRound size={18} /></span>Recipients</button>
          </div>
        </article>

        <article className="panel balance-chart-card">
          <div className="panel__heading panel__heading--compact">
            <div><p className="panel__eyebrow">Balance trend</p><h2>Last 6 months</h2></div>
            <span className="trend-positive"><ArrowUpRight size={15} /> 12.4%</span>
          </div>
          <div className="balance-chart-card__chart">
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart data={balanceTrend} margin={{ left: 0, right: 0, top: 14, bottom: 0 }}>
                <defs><linearGradient id="balanceFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#1d8a70" stopOpacity={0.25} /><stop offset="100%" stopColor="#1d8a70" stopOpacity={0} /></linearGradient></defs>
                <XAxis axisLine={false} dataKey="label" tick={{ fill: '#85918e', fontSize: 11 }} tickLine={false} />
                <YAxis hide domain={['dataMin - 500', 'dataMax + 500']} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e3e9e6', boxShadow: '0 8px 24px rgba(14,39,32,.1)', fontSize: 12 }} formatter={(value) => [formatMoney(Number(value), primaryAccount?.currency), 'Balance']} />
                <Area dataKey="value" fill="url(#balanceFill)" stroke="#1d8a70" strokeWidth={2.5} type="monotone" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="balance-chart-card__summary"><span><small>Money in</small><strong className="money-in">+{formatMoney(incomingThisMonth || 2840, primaryAccount?.currency)}</strong></span><span><small>Money out</small><strong>{formatMoney(outgoingThisMonth || 1286.4, primaryAccount?.currency)}</strong></span></div>
        </article>
      </section>

      <section className="quick-stats">
        <article><span className="quick-stat__icon quick-stat__icon--green"><WalletCards size={20} /></span><div><small>Active accounts</small><strong>{accounts.length}</strong></div><button onClick={() => navigate('/accounts')} type="button"><ArrowRight size={17} /></button></article>
        <article><span className="quick-stat__icon quick-stat__icon--blue"><CreditCard size={20} /></span><div><small>Transactions</small><strong>{transactions.length}</strong></div><button onClick={() => navigate('/transactions')} type="button"><ArrowRight size={17} /></button></article>
        <article><span className="quick-stat__icon quick-stat__icon--amber"><UsersRound size={20} /></span><div><small>Beneficiaries</small><strong>{beneficiaries.length}</strong></div><button onClick={() => navigate('/beneficiaries')} type="button"><ArrowRight size={17} /></button></article>
      </section>

      <section className="dashboard-content-grid">
        <article className="panel recent-transactions">
          <div className="panel__heading"><div><h2>Recent activity</h2><p>Your latest account movements</p></div><button className="button button--ghost button--small" onClick={() => navigate('/transactions')} type="button">View all <ArrowRight size={15} /></button></div>
          {transactions.length ? (
            <div className="transaction-list">
              {transactions.slice(0, 5).map((transaction) => {
                const outgoing = isOutgoing(transaction)
                return (
                  <button className="transaction-row" key={transaction.id} onClick={() => navigate('/transactions')} type="button">
                    <TransactionMark outgoing={outgoing} />
                    <span className="transaction-row__copy"><strong>{transaction.description || (outgoing ? 'Money transfer' : 'Incoming transfer')}</strong><small>{formatDate(transaction.createdAt, true)} · {transaction.reference.slice(0, 16)}</small></span>
                    <span className="transaction-row__status"><Badge value={transaction.status} /></span>
                    <strong className={outgoing ? '' : 'money-in'}>{outgoing ? '−' : '+'}{formatMoney(transaction.amount, transaction.currency)}</strong>
                  </button>
                )
              })}
            </div>
          ) : <EmptyState action={<button className="button button--primary button--small" onClick={() => navigate('/transfer')} type="button">Make your first transfer</button>} description="Your payments and deposits will appear here." title="No transactions yet" />}
        </article>

        <aside className="dashboard-side-stack">
          <article className="security-card">
            <span className="security-card__icon"><ShieldCheck size={24} /></span>
            <div><span className="security-card__label">Security status</span><h3>Your account is protected</h3><p>Real-time fraud monitoring is active on every transaction.</p></div>
            <button onClick={() => navigate('/security')} type="button">Review security <ArrowRight size={15} /></button>
          </article>
          <article className="insight-card">
            <span><Sparkles size={18} /> Smart insight</span>
            <h3>You’re building a healthy balance</h3>
            <p>Your available funds are trending up compared with last month.</p>
          </article>
        </aside>
      </section>
    </div>
  )
}
