import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import './App.css'
import { AppShell } from './components/AppShell'
import { LoadingState } from './components/ui'
import { AuthProvider, useAuth } from './context/AuthContext'
import { BankDataProvider } from './context/BankDataContext'
import type { UserRole } from './types'

const AccountsPage = lazy(() => import('./pages/AccountsPage').then((module) => ({ default: module.AccountsPage })))
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage').then((module) => ({ default: module.AdminUsersPage })))
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage').then((module) => ({ default: module.AuditLogsPage })))
const BeneficiariesPage = lazy(() => import('./pages/BeneficiariesPage').then((module) => ({ default: module.BeneficiariesPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const FraudAlertsPage = lazy(() => import('./pages/FraudAlertsPage').then((module) => ({ default: module.FraudAlertsPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const MfaPage = lazy(() => import('./pages/MfaPage').then((module) => ({ default: module.MfaPage })))
const OperationsDashboardPage = lazy(() => import('./pages/OperationsDashboardPage').then((module) => ({ default: module.OperationsDashboardPage })))
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((module) => ({ default: module.RegisterPage })))
const SecurityPage = lazy(() => import('./pages/SecurityPage').then((module) => ({ default: module.SecurityPage })))
const TransactionsPage = lazy(() => import('./pages/TransactionsPage').then((module) => ({ default: module.TransactionsPage })))
const TransferPage = lazy(() => import('./pages/TransferPage').then((module) => ({ default: module.TransferPage })))

const operationsRoles: UserRole[] = ['FRAUD_ANALYST', 'SECURITY_ANALYST', 'ADMIN']
const customerRoles: UserRole[] = ['CUSTOMER', 'BANK_EMPLOYEE']

function ProtectedApp() {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingState />
  if (!isAuthenticated) return <Navigate replace state={{ from: location.pathname }} to="/login" />

  return (
    <BankDataProvider>
      <AppShell />
    </BankDataProvider>
  )
}

function RoleRoute({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate replace to="/login" />
  if (!roles.includes(user.role)) return <Navigate replace to={operationsRoles.includes(user.role) ? '/ops' : '/'} />
  return children
}

function HomePage() {
  const { user } = useAuth()
  if (user && operationsRoles.includes(user.role)) return <Navigate replace to="/ops" />
  return <DashboardPage />
}

function NotFoundRedirect() {
  const { user } = useAuth()
  return <Navigate replace to={user && operationsRoles.includes(user.role) ? '/ops' : '/'} />
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<LoginPage />} path="/login" />
      <Route element={<RegisterPage />} path="/register" />
      <Route element={<MfaPage />} path="/mfa" />

      <Route element={<ProtectedApp />}>
        <Route index element={<HomePage />} />
        <Route element={<RoleRoute roles={customerRoles}><AccountsPage /></RoleRoute>} path="accounts" />
        <Route element={<RoleRoute roles={customerRoles}><TransferPage /></RoleRoute>} path="transfer" />
        <Route element={<RoleRoute roles={customerRoles}><TransactionsPage /></RoleRoute>} path="transactions" />
        <Route element={<RoleRoute roles={customerRoles}><BeneficiariesPage /></RoleRoute>} path="beneficiaries" />
        <Route element={<SecurityPage />} path="security" />

        <Route element={<RoleRoute roles={operationsRoles}><OperationsDashboardPage /></RoleRoute>} path="ops" />
        <Route element={<RoleRoute roles={operationsRoles}><FraudAlertsPage /></RoleRoute>} path="ops/alerts" />
        <Route element={<RoleRoute roles={['ADMIN']}><AdminUsersPage /></RoleRoute>} path="ops/users" />
        <Route element={<RoleRoute roles={['ADMIN', 'SECURITY_ANALYST']}><AuditLogsPage /></RoleRoute>} path="ops/audit-logs" />
        <Route element={<NotFoundRedirect />} path="*" />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<LoadingState />}>
          <AppRoutes />
        </Suspense>
        <Toaster closeButton position="top-right" richColors toastOptions={{ duration: 4200 }} />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
