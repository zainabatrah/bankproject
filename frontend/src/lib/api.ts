import axios, {
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'

import type {
  AuthSession,
  LoginResult,
  User,
} from '../types'

export const API_BASE_URL = (
  import.meta.env.VITE_API_URL?.trim() || 'http://localhost:3000'
).replace(/\/+$/, '')

export const AUTH_EXPIRED_EVENT = 'bankshield:auth-expired'
export const AUTH_SESSION_CHANGED_EVENT = 'bankshield:auth-session-changed'

export const AUTH_SESSION_STORAGE_KEY = 'bankshield.auth.session.v1'
export const DEVICE_ID_STORAGE_KEY = 'bankshield.device-id.v1'

interface RequestMetadata {
  skipAuth?: boolean
  skipAuthRefresh?: boolean
  _retry?: boolean
}

type AuthRequestConfig<D = unknown> = AxiosRequestConfig<D> & RequestMetadata
type RetriableRequestConfig<D = unknown> =
  InternalAxiosRequestConfig<D> & RequestMetadata

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  firstName: string
  lastName: string
  password: string
}

export interface MfaVerificationPayload {
  mfaToken: string
  code: string
}

export interface MfaRecoveryPayload {
  mfaToken: string
  recoveryCode: string
}

export type LoginResponse = AuthSession | LoginResult

export interface AuthExpiredDetail {
  message: string
}

const USER_ROLES = new Set([
  'CUSTOMER',
  'BANK_EMPLOYEE',
  'FRAUD_ANALYST',
  'SECURITY_ANALYST',
  'ADMIN',
])

const USER_STATUSES = new Set(['ACTIVE', 'LOCKED', 'SUSPENDED'])

let memorySession: AuthSession | null = null
let memoryDeviceId: string | null = null
let refreshPromise: Promise<AuthSession> | null = null

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function emitWindowEvent<T>(name: string, detail: T) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<T>(name, { detail }))
}

function createUniqueId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  const random = Math.random().toString(36).slice(2)
  return `bs-${Date.now().toString(36)}-${random}`
}

export function getDeviceId(): string {
  const storage = browserStorage()

  if (storage) {
    try {
      const stored = storage.getItem(DEVICE_ID_STORAGE_KEY)?.trim()
      if (stored) {
        memoryDeviceId = stored
        return stored
      }

      const deviceId = createUniqueId()
      storage.setItem(DEVICE_ID_STORAGE_KEY, deviceId)
      memoryDeviceId = deviceId
      return deviceId
    } catch {
      // Fall back to a stable in-memory identifier when storage is unavailable.
    }
  }

  memoryDeviceId ??= createUniqueId()
  return memoryDeviceId
}

function isUser(value: unknown): value is User {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<User>
  return (
    typeof candidate.id === 'number' &&
    typeof candidate.email === 'string' &&
    typeof candidate.firstName === 'string' &&
    typeof candidate.lastName === 'string' &&
    typeof candidate.role === 'string' &&
    USER_ROLES.has(candidate.role) &&
    typeof candidate.status === 'string' &&
    USER_STATUSES.has(candidate.status)
  )
}

export function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<AuthSession>
  return (
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    typeof candidate.refreshToken === 'string' &&
    candidate.refreshToken.length > 0 &&
    isUser(candidate.user) &&
    (candidate.isDemo === undefined || typeof candidate.isDemo === 'boolean')
  )
}

export function getStoredSession(): AuthSession | null {
  const storage = browserStorage()

  if (!storage) return memorySession

  try {
    const raw = storage.getItem(AUTH_SESSION_STORAGE_KEY)
    if (!raw) {
      memorySession = null
      return null
    }

    const parsed: unknown = JSON.parse(raw)
    if (!isAuthSession(parsed)) {
      storage.removeItem(AUTH_SESSION_STORAGE_KEY)
      memorySession = null
      return null
    }

    memorySession = parsed
    return parsed
  } catch {
    try {
      storage.removeItem(AUTH_SESSION_STORAGE_KEY)
    } catch {
      // Storage may have become unavailable between reads.
    }
    memorySession = null
    return null
  }
}

export function saveStoredSession(session: AuthSession) {
  memorySession = session

  try {
    browserStorage()?.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // The in-memory session still supports restricted/private browser modes.
  }

  emitWindowEvent<AuthSession | null>(AUTH_SESSION_CHANGED_EVENT, session)
}

export function clearStoredSession() {
  memorySession = null

  try {
    browserStorage()?.removeItem(AUTH_SESSION_STORAGE_KEY)
  } catch {
    // Clearing the in-memory copy is still useful if storage is unavailable.
  }

  emitWindowEvent<AuthSession | null>(AUTH_SESSION_CHANGED_EVENT, null)
}

function expireSession(message: string, expectedRefreshToken?: string) {
  const session = getStoredSession()

  if (
    expectedRefreshToken &&
    session?.refreshToken !== expectedRefreshToken
  ) {
    return
  }

  const hadSession = Boolean(session)
  clearStoredSession()

  if (hadSession) {
    emitWindowEvent<AuthExpiredDetail>(AUTH_EXPIRED_EVENT, { message })
  }
}

function collectErrorMessages(value: unknown, depth = 0): string[] {
  if (depth > 3 || value == null) return []

  if (typeof value === 'string') {
    const message = value.trim()
    return message ? [message] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectErrorMessages(item, depth + 1))
  }

  if (typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  const keys = ['message', 'messages', 'detail', 'details', 'errors', 'error']

  for (const key of keys) {
    const messages = collectErrorMessages(record[key], depth + 1)
    if (messages.length > 0) return messages
  }

  return []
}

export function extractApiError(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (axios.isAxiosError(error)) {
    const responseMessages = collectErrorMessages(error.response?.data)
    if (responseMessages.length > 0) {
      return [...new Set(responseMessages)].join(' ')
    }

    if (error.code === 'ERR_CANCELED') return 'The request was cancelled.'

    if (!error.response) {
      return 'Unable to reach BankShield. Check your connection and try again.'
    }

    if (error.message && error.message !== 'Network Error') return error.message
    return fallback
  }

  const messages = collectErrorMessages(error)
  if (messages.length > 0) return [...new Set(messages)].join(' ')

  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

export const getApiErrorMessage = extractApiError

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
  },
})

const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
  },
})

api.interceptors.request.use((request) => {
  const config = request as RetriableRequestConfig
  const session = getStoredSession()

  config.headers.set('X-Device-ID', getDeviceId())

  if (!config.skipAuth && session?.accessToken && !session.isDemo) {
    config.headers.set('Authorization', `Bearer ${session.accessToken}`)
  }

  return config
})

async function performRefresh(): Promise<AuthSession> {
  const session = getStoredSession()

  if (!session?.refreshToken || session.isDemo) {
    throw new Error('No refreshable session is available.')
  }

  const refreshToken = session.refreshToken
  const response = await refreshClient.post<{
    accessToken: string
    refreshToken: string
  }>(
    '/auth/refresh',
    { refreshToken },
    { headers: { 'X-Device-ID': getDeviceId() } },
  )

  // A logout or a newer login may have happened while the refresh was pending.
  const latestSession = getStoredSession()
  if (!latestSession) {
    throw new Error('The session ended while it was being refreshed.')
  }

  if (latestSession.refreshToken !== refreshToken) return latestSession

  const refreshedSession: AuthSession = {
    ...latestSession,
    accessToken: response.data.accessToken,
    refreshToken: response.data.refreshToken,
  }

  saveStoredSession(refreshedSession)
  return refreshedSession
}

export function refreshAuthSession(): Promise<AuthSession> {
  refreshPromise ??= performRefresh().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) {
      return Promise.reject(error)
    }

    const config = error.config as RetriableRequestConfig | undefined
    if (!config || config.skipAuthRefresh) return Promise.reject(error)

    const session = getStoredSession()
    if (!session || session.isDemo) return Promise.reject(error)

    if (config._retry) {
      expireSession('Your session has expired. Please sign in again.', session.refreshToken)
      return Promise.reject(error)
    }

    if (!session.refreshToken) {
      expireSession('Your session has expired. Please sign in again.')
      return Promise.reject(error)
    }

    config._retry = true
    const attemptedRefreshToken = session.refreshToken

    try {
      const refreshed = await refreshAuthSession()
      config.headers.set('Authorization', `Bearer ${refreshed.accessToken}`)
      return api(config)
    } catch (refreshError) {
      expireSession(
        extractApiError(
          refreshError,
          'Your session has expired. Please sign in again.',
        ),
        attemptedRefreshToken,
      )
      return Promise.reject(refreshError)
    }
  },
)

const publicAuthConfig: AuthRequestConfig = {
  skipAuth: true,
  skipAuthRefresh: true,
}

export const authApi = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>(
      '/auth/login',
      { email, password } satisfies LoginCredentials,
      publicAuthConfig,
    )
    return response.data
  },

  async register(payload: RegisterPayload): Promise<User> {
    const response = await api.post<User>(
      '/auth/register',
      payload,
      publicAuthConfig,
    )
    return response.data
  },

  async verifyMfa(mfaToken: string, code: string): Promise<AuthSession> {
    const response = await api.post<AuthSession>(
      '/auth/mfa/login-verify',
      { mfaToken, code } satisfies MfaVerificationPayload,
      publicAuthConfig,
    )
    return response.data
  },

  async recoveryLogin(
    mfaToken: string,
    recoveryCode: string,
  ): Promise<AuthSession> {
    const response = await api.post<AuthSession>(
      '/auth/mfa/recovery-login',
      { mfaToken, recoveryCode } satisfies MfaRecoveryPayload,
      publicAuthConfig,
    )
    return response.data
  },

  async logout(refreshToken?: string): Promise<void> {
    const token = refreshToken || getStoredSession()?.refreshToken
    if (!token) return

    await api.post(
      '/auth/logout',
      { refreshToken: token },
      publicAuthConfig,
    )
  },

  async me(): Promise<User> {
    const response = await api.get<User>('/auth/me')
    return response.data
  },
}

export default api
