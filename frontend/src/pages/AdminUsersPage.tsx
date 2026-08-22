import { useMemo, useState, type FormEvent } from 'react'
import {
  ChevronDown,
  Filter,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  UsersRound,
  UserX,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  PageHeader,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useBankData } from '../context/BankDataContext'
import { extractApiError } from '../lib/api'
import { formatDate, initials, titleCase } from '../lib/format'
import type { AdminUser, UserRole, UserStatus } from '../types'

type FilterValue<T extends string> = T | 'ALL'

const roles: UserRole[] = [
  'CUSTOMER',
  'BANK_EMPLOYEE',
  'FRAUD_ANALYST',
  'SECURITY_ANALYST',
  'ADMIN',
]

const statuses: Array<{
  value: UserStatus
  label: string
  description: string
}> = [
  {
    value: 'ACTIVE',
    label: 'Active',
    description: 'Restore sign-in and all access granted by this user’s role.',
  },
  {
    value: 'LOCKED',
    label: 'Locked',
    description: 'Block sign-in until an administrator restores access.',
  },
  {
    value: 'SUSPENDED',
    label: 'Suspended',
    description: 'Disable access for an administrative or compliance hold.',
  },
]

function countLabel(value: number | undefined, singular: string) {
  if (value === undefined) return `— ${singular}${singular.endsWith('s') ? '' : 's'}`
  return `${value.toLocaleString()} ${singular}${value === 1 ? '' : 's'}`
}

export function AdminUsersPage() {
  const { user: signedInUser } = useAuth()
  const { users, loading, error, reload, updateUserStatus } = useBankData()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<FilterValue<UserRole>>('ALL')
  const [status, setStatus] = useState<FilterValue<UserStatus>>('ALL')
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [nextStatus, setNextStatus] = useState<UserStatus>('ACTIVE')
  const [submitting, setSubmitting] = useState(false)

  const summary = useMemo(() => {
    const active = users.filter((candidate) => candidate.status === 'ACTIVE').length
    const mfaEnabled = users.filter((candidate) => candidate.mfaEnabled).length
    const restricted = users.length - active

    return {
      active,
      mfaEnabled,
      restricted,
      mfaCoverage: users.length
        ? Math.round((mfaEnabled / users.length) * 100)
        : 0,
    }
  }, [users])

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()

    return users.filter((candidate) => {
      const searchable = [
        candidate.firstName,
        candidate.lastName,
        candidate.email,
        candidate.role,
        titleCase(candidate.role),
        candidate.status,
      ]
        .join(' ')
        .toLowerCase()

      const matchesSearch = !query || searchable.includes(query)
      const matchesRole = role === 'ALL' || candidate.role === role
      const matchesStatus = status === 'ALL' || candidate.status === status

      return matchesSearch && matchesRole && matchesStatus
    })
  }, [role, search, status, users])

  const filtersActive = Boolean(search.trim()) || role !== 'ALL' || status !== 'ALL'

  if (loading) return <LoadingState label="Loading user access controls" />

  if (signedInUser && signedInUser.role !== 'ADMIN') {
    return (
      <ErrorState message="Administrator access is required to manage users." />
    )
  }

  if (error && users.length === 0) {
    return <ErrorState message={error} onRetry={reload} />
  }

  function clearFilters() {
    setSearch('')
    setRole('ALL')
    setStatus('ALL')
  }

  function openStatusModal(candidate: AdminUser) {
    if (candidate.id === signedInUser?.id) {
      toast.warning('You cannot change your own account status')
      return
    }

    setSelectedUser(candidate)
    setNextStatus(candidate.status)
  }

  function closeStatusModal() {
    if (submitting) return
    setSelectedUser(null)
  }

  async function handleStatusChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedUser || nextStatus === selectedUser.status) return

    if (selectedUser.id === signedInUser?.id) {
      toast.error('You cannot change your own account status')
      setSelectedUser(null)
      return
    }

    setSubmitting(true)

    try {
      await updateUserStatus(selectedUser.id, nextStatus)
      toast.success(
        `${selectedUser.firstName} ${selectedUser.lastName} is now ${titleCase(nextStatus).toLowerCase()}`,
      )
      setSelectedUser(null)
    } catch (updateError) {
      toast.error(extractApiError(updateError, 'Could not update this user'))
    } finally {
      setSubmitting(false)
    }
  }

  const statusDescription =
    statuses.find((option) => option.value === nextStatus)?.description ?? ''

  return (
    <div className="page-stack">
      <PageHeader
        actions={(
          <button
            className="button button--secondary"
            onClick={() => void reload()}
            type="button"
          >
            <RefreshCw size={17} /> Refresh users
          </button>
        )}
        description="Review identities, security posture, and account access from one place."
        eyebrow="Administration"
        title="User management"
      />

      {error && <ErrorState message={error} onRetry={reload} />}

      <section aria-label="User overview" className="quick-stats">
        <article>
          <span className="quick-stat__icon quick-stat__icon--green">
            <UsersRound size={20} />
          </span>
          <div>
            <small>Total users</small>
            <strong>{users.length.toLocaleString()}</strong>
          </div>
          <Badge tone="success" value={`${summary.active} active`} />
        </article>
        <article>
          <span className="quick-stat__icon quick-stat__icon--blue">
            <ShieldCheck size={20} />
          </span>
          <div>
            <small>MFA coverage</small>
            <strong>{summary.mfaCoverage}%</strong>
          </div>
          <Badge tone="info" value={`${summary.mfaEnabled} protected`} />
        </article>
        <article>
          <span className="quick-stat__icon quick-stat__icon--amber">
            <UserX size={20} />
          </span>
          <div>
            <small>Access restricted</small>
            <strong>{summary.restricted.toLocaleString()}</strong>
          </div>
          <Badge
            tone={summary.restricted ? 'warning' : 'success'}
            value={summary.restricted ? 'Review' : 'All clear'}
          />
        </article>
      </section>

      <section className="panel table-panel">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Search users"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email, or role"
              value={search}
            />
          </label>
          <div className="table-toolbar__filters">
            <label>
              <Filter size={16} />
              <select
                aria-label="Filter users by role"
                onChange={(event) =>
                  setRole(event.target.value as FilterValue<UserRole>)
                }
                value={role}
              >
                <option value="ALL">All roles</option>
                {roles.map((option) => (
                  <option key={option} value={option}>
                    {titleCase(option)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <SlidersHorizontal size={16} />
              <select
                aria-label="Filter users by status"
                onChange={(event) =>
                  setStatus(event.target.value as FilterValue<UserStatus>)
                }
                value={status}
              >
                <option value="ALL">All statuses</option>
                {statuses.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {filteredUsers.length > 0 ? (
          <>
            <div className="data-table-wrap">
              <table className="data-table transactions-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Sign-in security</th>
                    <th>Account footprint</th>
                    <th>Status</th>
                    <th className="align-right">Access</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((candidate) => {
                    const isSelf = candidate.id === signedInUser?.id
                    const counts = candidate._count

                    return (
                      <tr key={candidate.id}>
                        <td>
                          <span className="avatar">
                            {initials(candidate.firstName, candidate.lastName)}
                          </span>
                          <span className="cell-primary">
                            <strong>
                              {candidate.firstName} {candidate.lastName}
                              {isSelf ? ' (you)' : ''}
                            </strong>
                            <small>{candidate.email}</small>
                            <small>
                              {candidate.createdAt
                                ? `Joined ${formatDate(candidate.createdAt)}`
                                : 'Join date unavailable'}
                            </small>
                          </span>
                        </td>
                        <td><Badge tone="neutral" value={candidate.role} /></td>
                        <td>
                          <span
                            className={`badge badge--${candidate.mfaEnabled ? 'success' : 'warning'}`}
                          >
                            {candidate.mfaEnabled
                              ? <ShieldCheck size={13} />
                              : <ShieldAlert size={13} />}
                            {candidate.mfaEnabled ? 'MFA enabled' : 'MFA off'}
                          </span>
                        </td>
                        <td>
                          <span className="cell-primary">
                            <strong>
                              {countLabel(counts?.accounts, 'account')} ·{' '}
                              {countLabel(counts?.devices, 'device')}
                            </strong>
                            <small>
                              {countLabel(counts?.loginAttempts, 'login attempt')} ·{' '}
                              {countLabel(counts?.securityEvents, 'security event')}
                            </small>
                          </span>
                        </td>
                        <td><Badge value={candidate.status} /></td>
                        <td className="align-right">
                          <button
                            aria-label={
                              isSelf
                                ? 'You cannot change your own status'
                                : `Change status for ${candidate.firstName} ${candidate.lastName}`
                            }
                            className="button button--secondary button--small"
                            disabled={isSelf}
                            onClick={() => openStatusModal(candidate)}
                            title={isSelf ? 'You cannot change your own status' : undefined}
                            type="button"
                          >
                            {isSelf ? <LockKeyhole size={15} /> : <UserCog size={15} />}
                            {isSelf ? 'Protected' : 'Manage'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <footer className="table-footer">
              <span>
                Showing {filteredUsers.length.toLocaleString()} of{' '}
                {users.length.toLocaleString()} users
              </span>
              <span>Changes are recorded in the audit log</span>
            </footer>
          </>
        ) : (
          <EmptyState
            action={filtersActive ? (
              <button
                className="button button--secondary button--small"
                onClick={clearFilters}
                type="button"
              >
                Clear filters
              </button>
            ) : undefined}
            description={
              filtersActive
                ? 'Try a different name, role, or account status.'
                : 'Users will appear here once accounts are created.'
            }
            icon={filtersActive ? <Search size={24} /> : <UsersRound size={24} />}
            title={filtersActive ? 'No matching users' : 'No users found'}
          />
        )}
      </section>

      {selectedUser && (
        <Modal
          description="This takes effect immediately and is recorded in the audit log."
          onClose={closeStatusModal}
          title="Change account status"
        >
          <form className="modal__body form-stack" onSubmit={handleStatusChange}>
            <div className="confirm-card">
              <span className="beneficiary-avatar">
                {initials(selectedUser.firstName, selectedUser.lastName)}
              </span>
              <div>
                <strong>{selectedUser.firstName} {selectedUser.lastName}</strong>
                <small>{selectedUser.email}</small>
              </div>
              <Badge value={selectedUser.status} />
            </div>

            <label className="field">
              <span>New account status</span>
              <span className="field__control field__control--select">
                <UserCog size={18} />
                <select
                  onChange={(event) =>
                    setNextStatus(event.target.value as UserStatus)
                  }
                  value={nextStatus}
                >
                  {statuses.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={17} />
              </span>
            </label>

            <div
              className={`inline-message ${
                nextStatus === 'ACTIVE'
                  ? 'inline-message--success'
                  : nextStatus === 'LOCKED'
                    ? 'inline-message--info'
                    : 'inline-message--error'
              }`}
            >
              {nextStatus === 'ACTIVE'
                ? <ShieldCheck size={17} />
                : <ShieldAlert size={17} />}
              <span>{statusDescription}</span>
            </div>

            <div className="modal__actions">
              <button
                className="button button--secondary"
                disabled={submitting}
                onClick={closeStatusModal}
                type="button"
              >
                Cancel
              </button>
              <button
                className={`button ${nextStatus === 'ACTIVE' ? 'button--primary' : 'button--danger'}`}
                disabled={submitting || nextStatus === selectedUser.status}
                type="submit"
              >
                {submitting ? 'Updating access…' : 'Update status'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
