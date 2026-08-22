/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  AUTH_EXPIRED_EVENT,
  AUTH_SESSION_CHANGED_EVENT,
  AUTH_SESSION_STORAGE_KEY,
  authApi,
  clearStoredSession,
  getStoredSession,
  isAuthSession,
  saveStoredSession,
  type RegisterPayload,
} from '../lib/api'
import type {
  AuthSession,
  LoginResult,
  User,
  UserRole,
} from '../types'

export interface AuthContextValue {
  session: AuthSession | null
  user: User | null
  isDemo: boolean
  isAuthenticated: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  register: (payload: RegisterPayload) => Promise<User>
  verifyMfa: (mfaToken: string, code: string) => Promise<AuthSession>
  recoveryLogin: (
    mfaToken: string,
    recoveryCode: string,
  ) => Promise<AuthSession>
  demoLogin: (role: UserRole) => AuthSession
  logout: () => Promise<void>
  refreshUser: () => Promise<User | null>
  updateUser: (partial: Partial<User>) => void
}

interface AuthProviderProps {
  children: ReactNode
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const DEMO_USERS: Record<
  UserRole,
  Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>
> = {
  CUSTOMER: {
    id: 90_001,
    email: 'customer@demo.bankshield.local',
    firstName: 'Alex',
    lastName: 'Morgan',
  },
  BANK_EMPLOYEE: {
    id: 90_002,
    email: 'employee@demo.bankshield.local',
    firstName: 'Jamie',
    lastName: 'Patel',
  },
  FRAUD_ANALYST: {
    id: 90_003,
    email: 'fraud@demo.bankshield.local',
    firstName: 'Maya',
    lastName: 'Chen',
  },
  SECURITY_ANALYST: {
    id: 90_004,
    email: 'security@demo.bankshield.local',
    firstName: 'Noah',
    lastName: 'Williams',
  },
  ADMIN: {
    id: 90_005,
    email: 'admin@demo.bankshield.local',
    firstName: 'Olivia',
    lastName: 'Reyes',
  },
}

function createDemoSession(role: UserRole): AuthSession {
  const profile = DEMO_USERS[role]
  const roleSlug = role.toLowerCase()

  return {
    accessToken: `demo-access-${roleSlug}`,
    refreshToken: `demo-refresh-${roleSlug}`,
    isDemo: true,
    user: {
      ...profile,
      role,
      status: 'ACTIVE',
      mfaEnabled: true,
      createdAt: new Date().toISOString(),
    },
  }
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(() =>
    getStoredSession(),
  )
  const [loading, setLoading] = useState(true)

  const commitSession = useCallback((nextSession: AuthSession | null) => {
    if (nextSession) saveStoredSession(nextSession)
    else clearStoredSession()
    setSession(nextSession)
  }, [])

  const refreshUser = useCallback(async (): Promise<User | null> => {
    const currentSession = getStoredSession()
    if (!currentSession) return null

    if (currentSession.isDemo) {
      setSession(currentSession)
      return currentSession.user
    }

    const user = await authApi.me()
    const latestSession = getStoredSession()

    // A logout in another tab should win over an in-flight profile request.
    if (!latestSession) return null

    commitSession({ ...latestSession, user })
    return user
  }, [commitSession])

  useEffect(() => {
    let active = true

    const handleSessionChanged = (event: Event) => {
      if (!active) return
      const nextSession = (event as CustomEvent<AuthSession | null>).detail
      setSession(nextSession ?? null)
    }

    const handleAuthExpired = () => {
      if (!active) return
      setSession(null)
      setLoading(false)
    }

    const handleStorage = (event: StorageEvent) => {
      if (!active || event.key !== AUTH_SESSION_STORAGE_KEY) return
      setSession(getStoredSession())
    }

    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, handleSessionChanged)
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
    window.addEventListener('storage', handleStorage)

    const restoreSession = async () => {
      const storedSession = getStoredSession()

      if (!storedSession || storedSession.isDemo) {
        if (active) {
          setSession(storedSession)
          setLoading(false)
        }
        return
      }

      try {
        await refreshUser()
      } catch {
        // A failed refresh emits AUTH_EXPIRED_EVENT. Network errors retain the
        // last known session so a temporary outage does not force a logout.
        if (active && !getStoredSession()) setSession(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    void restoreSession()

    return () => {
      active = false
      window.removeEventListener(
        AUTH_SESSION_CHANGED_EVENT,
        handleSessionChanged,
      )
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
      window.removeEventListener('storage', handleStorage)
    }
  }, [refreshUser])

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const result = await authApi.login(email, password)

      if (isAuthSession(result)) {
        commitSession(result)
        return { mfaRequired: false }
      }

      return result
    },
    [commitSession],
  )

  const register = useCallback((payload: RegisterPayload) => {
    return authApi.register(payload)
  }, [])

  const verifyMfa = useCallback(
    async (mfaToken: string, code: string): Promise<AuthSession> => {
      const authenticatedSession = await authApi.verifyMfa(mfaToken, code)
      commitSession(authenticatedSession)
      return authenticatedSession
    },
    [commitSession],
  )

  const recoveryLogin = useCallback(
    async (
      mfaToken: string,
      recoveryCode: string,
    ): Promise<AuthSession> => {
      const authenticatedSession = await authApi.recoveryLogin(
        mfaToken,
        recoveryCode,
      )
      commitSession(authenticatedSession)
      return authenticatedSession
    },
    [commitSession],
  )

  const demoLogin = useCallback(
    (role: UserRole): AuthSession => {
      const demoSession = createDemoSession(role)
      commitSession(demoSession)
      return demoSession
    },
    [commitSession],
  )

  const logout = useCallback(async (): Promise<void> => {
    const currentSession = getStoredSession()
    commitSession(null)

    if (!currentSession || currentSession.isDemo) return

    try {
      await authApi.logout(currentSession.refreshToken)
    } catch {
      // Local logout is authoritative even when the server is unavailable.
    }
  }, [commitSession])

  const updateUser = useCallback(
    (partial: Partial<User>) => {
      const currentSession = getStoredSession()
      if (!currentSession) return

      commitSession({
        ...currentSession,
        user: { ...currentSession.user, ...partial },
      })
    },
    [commitSession],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isDemo: Boolean(session?.isDemo),
      isAuthenticated: Boolean(session),
      loading,
      login,
      register,
      verifyMfa,
      recoveryLogin,
      demoLogin,
      logout,
      refreshUser,
      updateUser,
    }),
    [
      demoLogin,
      loading,
      login,
      logout,
      recoveryLogin,
      refreshUser,
      register,
      session,
      updateUser,
      verifyMfa,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.')
  }

  return context
}
