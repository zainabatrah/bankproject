import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AxiosRequestConfig } from 'axios'

import api, { extractApiError } from '../lib/api'
import { getDemoDataForRole, type DemoBankData } from '../lib/demo-data'
import type {
  Account,
  AdminUser,
  AlertStatus,
  AuditLog,
  Beneficiary,
  FraudAlert,
  RiskLevel,
  Transaction,
  TransferPayload,
  User,
  UserRole,
  UserStatus,
} from '../types'
import { useAuth } from './AuthContext'

type DataKey = keyof DemoBankData

interface DataResource {
  key: DataKey
  path: string
}

const customerResources: DataResource[] = [
  { key: 'accounts', path: '/accounts/me' },
  { key: 'transactions', path: '/transactions/me' },
  { key: 'beneficiaries', path: '/beneficiaries' },
]

const resourcesByRole: Record<UserRole, DataResource[]> = {
  CUSTOMER: customerResources,
  BANK_EMPLOYEE: customerResources,
  FRAUD_ANALYST: [{ key: 'alerts', path: '/fraud-alerts' }],
  SECURITY_ANALYST: [
    { key: 'alerts', path: '/fraud-alerts' },
    { key: 'auditLogs', path: '/audit-logs' },
  ],
  ADMIN: [
    { key: 'alerts', path: '/fraud-alerts' },
    { key: 'users', path: '/admin/users' },
    { key: 'auditLogs', path: '/audit-logs' },
  ],
}

export interface CreateBeneficiaryInput {
  name: string
  accountNumber: string
  bankName?: string
}

export interface FraudAnalysisResult {
  risk_score: number
  risk_level: RiskLevel
  flagged: boolean
  reasons: string[]
}

export interface TransferResult {
  message: string
  transaction: Transaction
  fraudAlert?: Omit<FraudAlert, 'transaction'>
  fraudAnalysis: FraudAnalysisResult
}

export interface UpdateAlertResult {
  message: string
  alert: FraudAlert
}

export interface UpdateUserResult {
  message: string
  user: AdminUser
}

export interface BankDataContextValue extends DemoBankData {
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  createAccount: (currency: Account['currency']) => Promise<Account>
  createBeneficiary: (input: CreateBeneficiaryInput) => Promise<Beneficiary>
  deleteBeneficiary: (id: number) => Promise<void>
  transfer: (payload: TransferPayload) => Promise<TransferResult>
  updateAlertStatus: (
    id: number,
    status: AlertStatus,
  ) => Promise<UpdateAlertResult>
  updateUserStatus: (
    id: number,
    status: UserStatus,
  ) => Promise<UpdateUserResult>
}

interface BankDataProviderProps {
  children: ReactNode
}

const BankDataContext = createContext<BankDataContextValue | undefined>(
  undefined,
)

function emptyData(): DemoBankData {
  return {
    accounts: [],
    transactions: [],
    beneficiaries: [],
    devices: [],
    alerts: [],
    users: [],
    auditLogs: [],
  }
}

function errorMessage(error: unknown): string {
  return extractApiError(error)
}

async function apiRequest<T>(
  path: string,
  config: AxiosRequestConfig = {},
): Promise<T> {
  try {
    const response = await api.request<T>({
      ...config,
      url: path,
    })
    return response.data
  } catch (requestError) {
    throw new Error(extractApiError(requestError), { cause: requestError })
  }
}

function nextId(items: Array<{ id: number }>, floor = 1): number {
  return Math.max(floor - 1, ...items.map((item) => item.id)) + 1
}

function canUseCustomerBanking(role?: UserRole): boolean {
  return role === 'CUSTOMER' || role === 'BANK_EMPLOYEE'
}

function canReviewAlerts(role?: UserRole): boolean {
  return (
    role === 'FRAUD_ANALYST' || role === 'SECURITY_ANALYST' || role === 'ADMIN'
  )
}

function canManageUsers(role?: UserRole): boolean {
  return role === 'ADMIN'
}

function actorForAuditLog(user: User | null | undefined) {
  if (!user) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  }
}

export function BankDataProvider({ children }: BankDataProviderProps) {
  const { session, user, isDemo } = useAuth()
  const [data, setData] = useState<DemoBankData>(emptyData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)

  const reload = useCallback(async () => {
    const version = ++requestVersion.current

    if (!session || !user) {
      setData(emptyData())
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    if (isDemo) {
      setData(getDemoDataForRole(user.role))
      setLoading(false)
      return
    }

    const resources = resourcesByRole[user.role]
    const nextData = emptyData()
    const failures: string[] = []

    const results = await Promise.allSettled(
      resources.map((resource) =>
        apiRequest<DemoBankData[DataKey]>(resource.path),
      ),
    )

    results.forEach((result, index) => {
      const resource = resources[index]

      if (result.status === 'fulfilled') {
        // Each endpoint in resourcesByRole returns the array represented by its key.
        Object.assign(nextData, { [resource.key]: result.value })
      } else {
        failures.push(errorMessage(result.reason))
      }
    })

    if (version !== requestVersion.current) {
      return
    }

    setData(nextData)
    setError(failures.length > 0 ? [...new Set(failures)].join(' ') : null)
    setLoading(false)
  }, [isDemo, session, user])

  useEffect(() => {
    let active = true

    queueMicrotask(() => {
      if (active) {
        void reload()
      }
    })

    return () => {
      active = false
      requestVersion.current += 1
    }
  }, [reload])

  const executeMutation = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T> => {
      setError(null)

      try {
        return await operation()
      } catch (caughtError) {
        const message = errorMessage(caughtError)
        setError(message)
        throw caughtError instanceof Error ? caughtError : new Error(message)
      }
    },
    [],
  )

  const createAccount = useCallback(
    (currency: Account['currency']) =>
      executeMutation(async () => {
        if (!canUseCustomerBanking(user?.role)) {
          throw new Error('This role cannot create customer accounts.')
        }

        if (!['USD', 'EUR', 'LBP'].includes(currency)) {
          throw new Error('Choose USD, EUR, or LBP for the new account.')
        }

        if (isDemo) {
          const created: Account = {
            id: nextId(data.accounts, 100),
            accountNumber: `BS${Math.floor(
              1_000_000_000 + Math.random() * 9_000_000_000,
            )}`,
            balance: 0,
            currency,
            createdAt: new Date().toISOString(),
          }

          setData((current) => ({
            ...current,
            accounts: [created, ...current.accounts],
          }))

          return created
        }

        const created = await apiRequest<Account>('/accounts', {
          method: 'POST',
          data: { currency },
        })
        await reload()
        return created
      }),
    [data.accounts, executeMutation, isDemo, reload, user?.role],
  )

  const createBeneficiary = useCallback(
    (input: CreateBeneficiaryInput) =>
      executeMutation(async () => {
        if (!canUseCustomerBanking(user?.role)) {
          throw new Error('This role cannot manage beneficiaries.')
        }

        const name = input.name.trim()
        const accountNumber = input.accountNumber.trim()
        const bankName = input.bankName?.trim() || 'BankShield'

        if (!name || !accountNumber) {
          throw new Error('Beneficiary name and account number are required.')
        }

        if (isDemo) {
          if (
            data.beneficiaries.some(
              (beneficiary) => beneficiary.accountNumber === accountNumber,
            )
          ) {
            throw new Error('Beneficiary already exists.')
          }

          const now = new Date().toISOString()
          const created: Beneficiary = {
            id: nextId(data.beneficiaries, 200),
            name,
            accountNumber,
            bankName,
            ownerId: user?.id,
            createdAt: now,
            updatedAt: now,
          }

          setData((current) => ({
            ...current,
            beneficiaries: [created, ...current.beneficiaries],
          }))

          return created
        }

        const created = await apiRequest<Beneficiary>(
          '/beneficiaries',
          {
            method: 'POST',
            data: { name, accountNumber, bankName },
          },
        )
        await reload()
        return created
      }),
    [
      data.beneficiaries,
      executeMutation,
      isDemo,
      reload,
      user?.id,
      user?.role,
    ],
  )

  const deleteBeneficiary = useCallback(
    (id: number) =>
      executeMutation(async () => {
        if (!canUseCustomerBanking(user?.role)) {
          throw new Error('This role cannot manage beneficiaries.')
        }

        if (isDemo) {
          if (!data.beneficiaries.some((beneficiary) => beneficiary.id === id)) {
            throw new Error('Beneficiary not found.')
          }

          setData((current) => ({
            ...current,
            beneficiaries: current.beneficiaries.filter(
              (beneficiary) => beneficiary.id !== id,
            ),
          }))
          return
        }

        await apiRequest<{ message: string }>(
          `/beneficiaries/${id}`,
          { method: 'DELETE' },
        )
        await reload()
      }),
    [
      data.beneficiaries,
      executeMutation,
      isDemo,
      reload,
      user?.role,
    ],
  )

  const transfer = useCallback(
    (payload: TransferPayload) =>
      executeMutation(async () => {
        if (!canUseCustomerBanking(user?.role)) {
          throw new Error('This role cannot create transfers.')
        }

        if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
          throw new Error('Transfer amount must be greater than zero.')
        }

        if (isDemo) {
          const account = data.accounts.find(
            (candidate) => candidate.id === payload.senderAccountId,
          )
          const beneficiary = data.beneficiaries.find(
            (candidate) => candidate.id === payload.beneficiaryId,
          )

          if (!account) {
            throw new Error('Sender account not found.')
          }

          if (!beneficiary) {
            throw new Error('Beneficiary not found.')
          }

          if (Number(account.balance) < payload.amount) {
            throw new Error('Insufficient balance.')
          }

          const riskScore =
            payload.amount >= 10_000
              ? 88
              : payload.amount >= 5_000
                ? 72
                : payload.amount >= 1_000
                  ? 38
                  : 12
          const riskLevel: RiskLevel =
            riskScore >= 80
              ? 'CRITICAL'
              : riskScore >= 60
                ? 'HIGH'
                : riskScore >= 30
                  ? 'MEDIUM'
                  : 'LOW'
          const flagged = riskLevel === 'HIGH' || riskLevel === 'CRITICAL'
          const now = new Date().toISOString()
          const transaction: Transaction = {
            id: nextId(data.transactions, 500),
            reference: `TX-DEMO-${Date.now().toString().slice(-8)}`,
            amount: payload.amount,
            currency: account.currency,
            description: payload.description?.trim() || null,
            type: 'TRANSFER',
            status: flagged ? 'FLAGGED' : 'COMPLETED',
            senderAccountId: account.id,
            receiverAccountId: 10_000 + beneficiary.id,
            riskScore,
            riskLevel,
            createdAt: now,
          }
          const reasons = flagged
            ? ['Transfer amount is above the normal demo profile']
            : ['Transaction matches the normal demo profile']
          const result: TransferResult = {
            message: flagged
              ? 'Transaction flagged for security review'
              : 'Transaction completed successfully',
            transaction,
            fraudAnalysis: {
              risk_score: riskScore,
              risk_level: riskLevel,
              flagged,
              reasons,
            },
          }

          if (flagged) {
            result.fraudAlert = {
              id: nextId(data.alerts, 700),
              riskScore,
              riskLevel,
              reason: reasons.join('; '),
              status: 'OPEN',
              transactionId: transaction.id,
              createdAt: now,
              updatedAt: now,
            }
          }

          setData((current) => ({
            ...current,
            accounts: flagged
              ? current.accounts
              : current.accounts.map((candidate) =>
                  candidate.id === account.id
                    ? {
                        ...candidate,
                        balance: Number(candidate.balance) - payload.amount,
                      }
                    : candidate,
                ),
            transactions: [transaction, ...current.transactions],
          }))

          return result
        }

        const result = await apiRequest<TransferResult>(
          '/transactions/transfer',
          {
            method: 'POST',
            data: payload,
          },
        )
        await reload()
        return result
      }),
    [
      data.accounts,
      data.alerts,
      data.beneficiaries,
      data.transactions,
      executeMutation,
      isDemo,
      reload,
      user?.role,
    ],
  )

  const updateAlertStatus = useCallback(
    (id: number, status: AlertStatus) =>
      executeMutation(async () => {
        if (!canReviewAlerts(user?.role)) {
          throw new Error('This role cannot update fraud alerts.')
        }

        if (isDemo) {
          const existing = data.alerts.find((alert) => alert.id === id)

          if (!existing) {
            throw new Error('Fraud alert not found.')
          }

          const now = new Date().toISOString()
          const updated: FraudAlert = { ...existing, status, updatedAt: now }

          setData((current) => {
            const maySeeAuditLogs =
              user?.role === 'SECURITY_ANALYST' || user?.role === 'ADMIN'
            const auditLog: AuditLog = {
              id: nextId(current.auditLogs, 900),
              action: 'FRAUD_ALERT_STATUS_CHANGED',
              resource: `FraudAlert:${id}`,
              result: 'SUCCESS',
              details: JSON.stringify({
                previousStatus: existing.status,
                newStatus: status,
              }),
              userId: user?.id,
              user: actorForAuditLog(user),
              createdAt: now,
            }

            return {
              ...current,
              alerts: current.alerts.map((alert) =>
                alert.id === id ? updated : alert,
              ),
              auditLogs: maySeeAuditLogs
                ? [auditLog, ...current.auditLogs]
                : current.auditLogs,
            }
          })

          return {
            message: 'Fraud alert status updated successfully',
            alert: updated,
          }
        }

        const result = await apiRequest<UpdateAlertResult>(
          `/fraud-alerts/${id}/status`,
          {
            method: 'PATCH',
            data: { status },
          },
        )
        await reload()
        return result
      }),
    [
      data.alerts,
      executeMutation,
      isDemo,
      reload,
      user,
    ],
  )

  const updateUserStatus = useCallback(
    (id: number, status: UserStatus) =>
      executeMutation(async () => {
        if (!canManageUsers(user?.role)) {
          throw new Error('Only administrators can update user status.')
        }

        if (isDemo) {
          const existing = data.users.find((candidate) => candidate.id === id)

          if (!existing) {
            throw new Error('User not found.')
          }

          const now = new Date().toISOString()
          const updated: AdminUser = { ...existing, status, updatedAt: now }

          setData((current) => {
            const auditLog: AuditLog = {
              id: nextId(current.auditLogs, 900),
              action: 'USER_STATUS_CHANGED',
              resource: `User:${id}`,
              result: 'SUCCESS',
              details: JSON.stringify({
                previousStatus: existing.status,
                newStatus: status,
              }),
              userId: user?.id,
              user: actorForAuditLog(user),
              createdAt: now,
            }

            return {
              ...current,
              users: current.users.map((candidate) =>
                candidate.id === id ? updated : candidate,
              ),
              auditLogs: [auditLog, ...current.auditLogs],
            }
          })

          return {
            message: 'User status updated successfully',
            user: updated,
          }
        }

        const result = await apiRequest<UpdateUserResult>(
          `/admin/users/${id}/status`,
          {
            method: 'PATCH',
            data: { status },
          },
        )
        await reload()
        return result
      }),
    [
      data.users,
      executeMutation,
      isDemo,
      reload,
      user,
    ],
  )

  const value = useMemo<BankDataContextValue>(
    () => ({
      ...data,
      loading,
      error,
      reload,
      createAccount,
      createBeneficiary,
      deleteBeneficiary,
      transfer,
      updateAlertStatus,
      updateUserStatus,
    }),
    [
      createAccount,
      createBeneficiary,
      data,
      deleteBeneficiary,
      error,
      loading,
      reload,
      transfer,
      updateAlertStatus,
      updateUserStatus,
    ],
  )

  return (
    <BankDataContext.Provider value={value}>{children}</BankDataContext.Provider>
  )
}

// The provider and its hook intentionally live together as one public data API.
// eslint-disable-next-line react-refresh/only-export-components
export function useBankData(): BankDataContextValue {
  const context = useContext(BankDataContext)

  if (!context) {
    throw new Error('useBankData must be used inside BankDataProvider.')
  }

  return context
}
