import { useMemo, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ChartNoAxesCombined,
  CircleGauge,
  FileClock,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Link } from 'react-router-dom'

import { Badge, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useBankData } from '../context/BankDataContext'
import { formatDate, formatMoney, initials, titleCase } from '../lib/format'
import type { AuditLog, FraudAlert, RiskLevel, UserRole } from '../types'

const riskColors: Record<RiskLevel, string> = {
  LOW: '#2b9275',
  MEDIUM: '#d79a3a',
  HIGH: '#e06d43',
  CRITICAL: '#ce4e56',
}

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

const operationsCopy: Partial<Record<UserRole, string>> = {
  FRAUD_ANALYST:
    'Prioritize suspicious transfers, assess risk signals, and move active alerts through review.',
  SECURITY_ANALYST:
    'Monitor fraud exposure and security activity across the protected banking environment.',
  ADMIN:
    'Track operational risk, analyst activity, and user access from one secure workspace.',
}

interface ActivityItem {
  id: string
  icon: ReactNode
  title: string
  description: string
  status: string
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  createdAt: string
}

function alertPriority(alert: FraudAlert): number {
  const statusWeight = alert.status === 'OPEN' ? 20 : alert.status === 'INVESTIGATING' ? 10 : 0
  return alert.riskScore + statusWeight
}

function auditActivity(log: AuditLog): ActivityItem {
  const actor = log.user
    ? `${log.user.firstName} ${log.user.lastName}`
    : 'BankShield system'
  const successful = !log.result || log.result === 'SUCCESS'

  return {
    id: `audit-${log.id}`,
    icon: <FileClock size={17} />,
    title: titleCase(log.action),
    description: `${actor}${log.resource ? ` · ${log.resource}` : ''}`,
    status: log.result || 'RECORDED',
    tone: successful ? 'success' : 'danger',
    createdAt: log.createdAt,
  }
}

function alertActivity(alert: FraudAlert): ActivityItem {
  const reference = alert.transaction.reference

  return {
    id: `alert-${alert.id}`,
    icon: <ShieldAlert size={17} />,
    title: `${titleCase(alert.riskLevel)} risk alert #${alert.id}`,
    description: `${reference} · Risk score ${alert.riskScore}/100`,
    status: alert.status,
    createdAt: alert.updatedAt || alert.createdAt,
  }
}

export function OperationsDashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const { alerts, auditLogs, users, loading, error, reload } = useBankData()

  const openAlerts = alerts.filter((alert) => alert.status === 'OPEN')
  const investigatingAlerts = alerts.filter(
    (alert) => alert.status === 'INVESTIGATING',
  )
  const unresolvedAlerts = alerts.filter(
    (alert) => alert.status === 'OPEN' || alert.status === 'INVESTIGATING',
  )
  const elevatedAlerts = unresolvedAlerts.filter(
    (alert) => alert.riskLevel === 'HIGH' || alert.riskLevel === 'CRITICAL',
  )
  const averageRisk = alerts.length
    ? Math.round(
        alerts.reduce((total, alert) => total + alert.riskScore, 0) / alerts.length,
      )
    : 0

  const riskDistribution = useMemo(
    () =>
      (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as RiskLevel[]).map((level) => ({
        level,
        count: alerts.filter((alert) => alert.riskLevel === level).length,
        color: riskColors[level],
      })),
    [alerts],
  )

  const alertTrend = useMemo(() => {
    if (!alerts.length) return []

    const anchor = new Date(
      Math.max(...alerts.map((alert) => new Date(alert.createdAt).getTime())),
    )
    anchor.setUTCHours(0, 0, 0, 0)

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(anchor)
      date.setUTCDate(anchor.getUTCDate() - (6 - index))
      const key = date.toISOString().slice(0, 10)
      const dailyAlerts = alerts.filter((alert) => alert.createdAt.slice(0, 10) === key)

      return {
        date: key,
        label: shortDateFormatter.format(date),
        alerts: dailyAlerts.length,
        critical: dailyAlerts.filter((alert) => alert.riskLevel === 'CRITICAL').length,
      }
    })
  }, [alerts])

  const priorityAlerts = useMemo(
    () =>
      [...elevatedAlerts]
        .sort(
          (left, right) =>
            alertPriority(right) - alertPriority(left) ||
            new Date(right.createdAt).getTime() -
              new Date(left.createdAt).getTime(),
        )
        .slice(0, 5),
    [elevatedAlerts],
  )

  const activity = useMemo(() => {
    const items = auditLogs.length
      ? auditLogs.map(auditActivity)
      : alerts.map(alertActivity)

    return items
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      )
      .slice(0, 5)
  }, [alerts, auditLogs])

  const activeUsers = users.filter((candidate) => candidate.status === 'ACTIVE').length
  const restrictedUsers = users.filter(
    (candidate) => candidate.status === 'LOCKED' || candidate.status === 'SUSPENDED',
  ).length
  const failedAuditEvents = auditLogs.filter(
    (log) => log.result && log.result !== 'SUCCESS',
  ).length
  const hasVisibleData = alerts.length > 0 || auditLogs.length > 0 || users.length > 0

  const scopedMetric =
    user?.role === 'ADMIN'
      ? {
          label: 'Active users',
          value: activeUsers,
          detail: `${restrictedUsers} access-restricted`,
          icon: <UsersRound size={20} />,
          color: 'blue',
        }
      : user?.role === 'SECURITY_ANALYST'
        ? {
            label: 'Audit activity',
            value: auditLogs.length,
            detail: failedAuditEvents
              ? `${failedAuditEvents} event${failedAuditEvents === 1 ? '' : 's'} need attention`
              : 'No failed actions detected',
            icon: <FileClock size={20} />,
            color: 'green',
          }
        : {
            label: 'Average risk',
            value: `${averageRisk}/100`,
            detail: 'Across the current alert queue',
            icon: <CircleGauge size={20} />,
            color: 'blue',
          }

  if (authLoading || (loading && !hasVisibleData)) {
    return <LoadingState label="Loading the operations workspace" />
  }

  if (error && !hasVisibleData) {
    return <ErrorState message={error} onRetry={reload} />
  }

  return (
    <div className="page-stack operations-dashboard">
      <PageHeader
        actions={
          <Link className="button button--primary" to="/ops/alerts">
            Review alert queue <ArrowRight size={17} />
          </Link>
        }
        description={
          operationsCopy[user?.role ?? 'FRAUD_ANALYST'] ??
          'Monitor fraud exposure and security activity across BankShield.'
        }
        eyebrow="Risk operations"
        title={`Welcome back, ${user?.firstName ?? 'analyst'}`}
      />

      {error && <ErrorState message={error} onRetry={reload} />}

      <section aria-label="Operations summary" className="quick-stats ops-kpi-grid">
        <article>
          <span className="quick-stat__icon quick-stat__icon--amber ops-kpi__icon ops-kpi__icon--orange">
            <AlertTriangle size={20} />
          </span>
          <div>
            <small>Open alerts</small>
            <strong>{openAlerts.length}</strong>
            <p className="ops-kpi__detail">Awaiting analyst review</p>
          </div>
        </article>
        <article>
          <span className="quick-stat__icon quick-stat__icon--amber ops-kpi__icon ops-kpi__icon--red">
            <ShieldAlert size={20} />
          </span>
          <div>
            <small>Elevated exposure</small>
            <strong>{elevatedAlerts.length}</strong>
            <p className="ops-kpi__detail">High or critical, unresolved</p>
          </div>
        </article>
        <article>
          <span className="quick-stat__icon quick-stat__icon--green ops-kpi__icon ops-kpi__icon--green">
            <Activity size={20} />
          </span>
          <div>
            <small>Investigating</small>
            <strong>{investigatingAlerts.length}</strong>
            <p className="ops-kpi__detail">Cases actively being assessed</p>
          </div>
        </article>
        <article>
          <span
            className={`quick-stat__icon quick-stat__icon--${scopedMetric.color} ops-kpi__icon ops-kpi__icon--${scopedMetric.color}`}
          >
            {scopedMetric.icon}
          </span>
          <div>
            <small>{scopedMetric.label}</small>
            <strong>{scopedMetric.value}</strong>
            <p className="ops-kpi__detail">{scopedMetric.detail}</p>
          </div>
        </article>
      </section>

      <section className="dashboard-hero-grid ops-analytics-grid">
        <article className="panel balance-chart-card ops-chart-card">
          <div className="panel__heading panel__heading--compact">
            <div>
              <p className="panel__eyebrow">Seven-day signal</p>
              <h2>Alert volume trend</h2>
            </div>
            <span className="trend-positive ops-live-indicator">
              <Activity size={14} /> Live monitoring
            </span>
          </div>
          <div className="balance-chart-card__chart ops-chart" aria-label="Alerts over seven days">
            {alertTrend.length ? (
              <ResponsiveContainer height="100%" width="100%">
                <AreaChart data={alertTrend} margin={{ bottom: 0, left: -24, right: 4, top: 12 }}>
                  <defs>
                    <linearGradient id="alertVolumeFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#287f6d" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#287f6d" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e8efec" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    axisLine={false}
                    dataKey="label"
                    tick={{ fill: '#7c8c87', fontSize: 11 }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tick={{ fill: '#7c8c87', fontSize: 11 }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      border: '1px solid #dfe7e4',
                      borderRadius: 10,
                      boxShadow: '0 8px 24px rgba(14,39,32,.1)',
                      fontSize: 12,
                    }}
                  />
                  <Area
                    dataKey="alerts"
                    fill="url(#alertVolumeFill)"
                    name="Alerts"
                    stroke="#1d806b"
                    strokeWidth={2.5}
                    type="monotone"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                description="Alert volume will appear when transaction monitoring produces signals."
                icon={<ChartNoAxesCombined size={23} />}
                title="No alert trend yet"
              />
            )}
          </div>
          <div className="balance-chart-card__summary ops-chart-summary">
            <span>
              <small>Total alerts</small>
              <strong>{alerts.length}</strong>
            </span>
            <span>
              <small>Unresolved</small>
              <strong>{unresolvedAlerts.length}</strong>
            </span>
            <span>
              <small>Average risk</small>
              <strong>{averageRisk}/100</strong>
            </span>
          </div>
        </article>

        <article className="panel balance-chart-card ops-chart-card ops-risk-card">
          <div className="panel__heading panel__heading--compact">
            <div>
              <p className="panel__eyebrow">Current portfolio</p>
              <h2>Risk distribution</h2>
            </div>
            <Badge
              tone={elevatedAlerts.length ? 'danger' : 'success'}
              value={elevatedAlerts.length ? `${elevatedAlerts.length} elevated` : 'Stable'}
            />
          </div>
          <div className="ops-risk-layout">
            <div className="balance-chart-card__chart ops-chart ops-risk-chart" aria-label="Alerts by risk level">
              {alerts.length ? (
                <ResponsiveContainer height="100%" width="100%">
                  <PieChart>
                    <Pie
                      cx="50%"
                      cy="50%"
                      data={riskDistribution}
                      dataKey="count"
                      innerRadius="59%"
                      nameKey="level"
                      outerRadius="85%"
                      paddingAngle={3}
                      stroke="none"
                    >
                      {riskDistribution.map((item) => (
                        <Cell fill={item.color} key={item.level} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        border: '1px solid #dfe7e4',
                        borderRadius: 10,
                        boxShadow: '0 8px 24px rgba(14,39,32,.1)',
                        fontSize: 12,
                      }}
                      formatter={(value, name) => [Number(value), titleCase(String(name))]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  description="Risk mix will be calculated when alerts are available."
                  icon={<CircleGauge size={23} />}
                  title="No risk data"
                />
              )}
            </div>
            <div className="balance-chart-card__summary ops-risk-legend">
              {riskDistribution.map((item) => (
                <div key={item.level}>
                  <span style={{ backgroundColor: item.color }} />
                  <small>{titleCase(item.level)}</small>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="dashboard-content-grid ops-content-grid">
        <article className="panel table-panel ops-priority-panel">
          <div className="panel__heading">
            <div>
              <h2>High-priority alerts</h2>
              <p>Unresolved high and critical signals, ordered by risk</p>
            </div>
            <Link className="button button--ghost button--small" to="/ops/alerts">
              View all <ArrowRight size={15} />
            </Link>
          </div>
          {priorityAlerts.length ? (
            <div className="data-table-wrap">
              <table className="data-table ops-alerts-table">
                <thead>
                  <tr>
                    <th>Alert</th>
                    <th>Customer</th>
                    <th>Exposure</th>
                    <th>Risk</th>
                    <th>Status</th>
                    <th aria-label="Review alert" />
                  </tr>
                </thead>
                <tbody>
                  {priorityAlerts.map((alert) => {
                    const sender = alert.transaction.senderAccount?.user

                    return (
                      <tr key={alert.id}>
                        <td>
                          <span className="cell-primary">
                            <strong>Alert #{alert.id}</strong>
                            <small>{formatDate(alert.createdAt, true)}</small>
                          </span>
                        </td>
                        <td>
                          <span className="ops-table-user">
                            <span className="mini-avatar">
                              {sender
                                ? initials(sender.firstName, sender.lastName)
                                : '—'}
                            </span>
                            <span className="cell-primary">
                              <strong>
                                {sender
                                  ? `${sender.firstName} ${sender.lastName}`
                                  : 'Unknown customer'}
                              </strong>
                              <small>{sender?.email ?? alert.transaction.reference}</small>
                            </span>
                          </span>
                        </td>
                        <td className="amount-cell">
                          {formatMoney(
                            alert.transaction.amount,
                            alert.transaction.currency,
                          )}
                        </td>
                        <td>
                          <span className="ops-risk-score">
                            <Badge value={alert.riskLevel} />
                            <strong>{alert.riskScore}</strong>
                          </span>
                        </td>
                        <td>
                          <Badge value={alert.status} />
                        </td>
                        <td>
                          <Link
                            aria-label={`Review alert ${alert.id}`}
                            className="button button--ghost button--small"
                            to="/ops/alerts"
                          >
                            Review <ArrowRight size={14} />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              action={
                <Link className="button button--secondary button--small" to="/ops/alerts">
                  Open alert queue
                </Link>
              }
              description="There are no unresolved high or critical alerts in the current queue."
              icon={<ShieldCheck size={24} />}
              title="High-priority queue is clear"
            />
          )}
        </article>

        <aside className="panel ops-activity-panel">
          <div className="panel__heading">
            <div>
              <h2>{auditLogs.length ? 'Operations activity' : 'Latest signals'}</h2>
              <p>
                {auditLogs.length
                  ? 'Recent traceable analyst and system actions'
                  : 'Most recently updated alerts'}
              </p>
            </div>
          </div>
          {activity.length ? (
            <div className="transaction-list ops-activity-list">
              {activity.map((item) => (
                <div className="transaction-row ops-activity-item" key={item.id}>
                  <span className="transaction-mark transaction-mark--in">
                    {item.icon}
                  </span>
                  <div className="cell-primary">
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                    <small>
                      <time dateTime={item.createdAt}>
                        {formatDate(item.createdAt, true)}
                      </time>
                    </small>
                  </div>
                  <Badge tone={item.tone} value={item.status} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              description="New analyst and system actions will be recorded here."
              icon={<Activity size={23} />}
              title="No recent activity"
            />
          )}
          {(user?.role === 'ADMIN' || user?.role === 'SECURITY_ANALYST') && (
            <div className="table-footer ops-activity-panel__footer">
              <Link className="button button--ghost button--small" to="/ops/audit-logs">
                View audit log <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}
