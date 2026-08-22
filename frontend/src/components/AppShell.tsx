import { useMemo, useState } from 'react'
import {
  ArrowLeftRight,
  Bell,
  ChevronRight,
  FileClock,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Search,
  Shield,
  ShieldAlert,
  UserCog,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { initials, titleCase } from '../lib/format'
import { Brand } from './Brand'

const customerNavigation = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/accounts', label: 'My accounts', icon: WalletCards },
  { to: '/transfer', label: 'Transfer money', icon: ArrowLeftRight },
  { to: '/transactions', label: 'Transactions', icon: ReceiptText },
  { to: '/beneficiaries', label: 'Beneficiaries', icon: UsersRound },
]

const operationsNavigation = [
  { to: '/ops', label: 'Operations overview', icon: LayoutDashboard, end: true },
  { to: '/ops/alerts', label: 'Fraud alerts', icon: ShieldAlert },
]

const routeTitles: Record<string, string> = {
  '/': 'Overview',
  '/accounts': 'My accounts',
  '/transfer': 'Transfer money',
  '/transactions': 'Transactions',
  '/beneficiaries': 'Beneficiaries',
  '/security': 'Security center',
  '/ops': 'Operations overview',
  '/ops/alerts': 'Fraud alerts',
  '/ops/users': 'User management',
  '/ops/audit-logs': 'Audit logs',
}

export function AppShell() {
  const { user, isDemo, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const isOperations = ['FRAUD_ANALYST', 'SECURITY_ANALYST', 'ADMIN'].includes(user?.role ?? '')
  const navigation = useMemo(() => {
    if (!isOperations) return customerNavigation

    const items = [...operationsNavigation]
    if (user?.role === 'ADMIN') {
      items.push({ to: '/ops/users', label: 'User management', icon: UserCog })
    }
    if (user?.role === 'ADMIN' || user?.role === 'SECURITY_ANALYST') {
      items.push({ to: '/ops/audit-logs', label: 'Audit logs', icon: FileClock })
    }
    return items
  }, [isOperations, user?.role])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={`app-shell ${mobileOpen ? 'app-shell--menu-open' : ''}`}>
      <button
        aria-label="Close navigation"
        className="mobile-scrim"
        onClick={() => setMobileOpen(false)}
        type="button"
      />

      <aside className="sidebar">
        <div className="sidebar__brand">
          <Brand inverse />
          <button
            aria-label="Close navigation"
            className="sidebar__close"
            onClick={() => setMobileOpen(false)}
            type="button"
          >
            <X size={21} />
          </button>
        </div>

        <div className="sidebar__workspace">
          <span>{isOperations ? 'Operations workspace' : 'Personal banking'}</span>
          <strong>{isOperations ? 'Risk & security' : 'Everyday banking'}</strong>
          <ChevronRight size={16} />
        </div>

        <nav aria-label="Primary navigation" className="sidebar__nav">
          <span className="sidebar__label">Menu</span>
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
              end={end}
              key={to}
              onClick={() => setMobileOpen(false)}
              to={to}
            >
              <Icon size={19} strokeWidth={1.9} />
              <span>{label}</span>
            </NavLink>
          ))}

          <span className="sidebar__label sidebar__label--spaced">Preferences</span>
          <NavLink
            className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
            onClick={() => setMobileOpen(false)}
            to="/security"
          >
            <Shield size={19} strokeWidth={1.9} />
            <span>Security center</span>
          </NavLink>
        </nav>

        <div className="sidebar__footer">
          <div className="security-pulse">
            <span className="security-pulse__icon"><Shield size={17} /></span>
            <div>
              <strong>Protection active</strong>
              <small>Fraud monitoring is on</small>
            </div>
          </div>
          <button className="sidebar__logout" onClick={handleLogout} type="button">
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="app-shell__main">
        {isDemo && (
          <div className="demo-banner">
            <span>Demo workspace</span>
            Changes are simulated locally and reset when you sign out.
          </div>
        )}
        <header className="topbar">
          <div className="topbar__left">
            <button
              aria-label="Open navigation"
              className="topbar__menu"
              onClick={() => setMobileOpen(true)}
              type="button"
            >
              <Menu size={22} />
            </button>
            <div>
              <span className="topbar__context">{isOperations ? 'BankShield Operations' : 'BankShield Online'}</span>
              <strong>{routeTitles[location.pathname] ?? 'BankShield'}</strong>
            </div>
          </div>

          <div className="topbar__actions">
            <button aria-label="Search" className="topbar__action topbar__search" type="button">
              <Search size={19} />
              <span>Search</span>
              <kbd>⌘ K</kbd>
            </button>
            <button aria-label="Notifications" className="topbar__action topbar__notification" type="button">
              <Bell size={19} />
              <span className="notification-dot" />
            </button>
            <div className="profile-menu">
              <button
                aria-expanded={profileOpen}
                className="profile-menu__trigger"
                onClick={() => setProfileOpen((open) => !open)}
                type="button"
              >
                <span className="avatar">{initials(user?.firstName, user?.lastName)}</span>
                <span className="profile-menu__copy">
                  <strong>{user?.firstName} {user?.lastName}</strong>
                  <small>{titleCase(user?.role ?? 'customer')}</small>
                </span>
                <ChevronRight className="profile-menu__chevron" size={16} />
              </button>
              {profileOpen && (
                <div className="profile-menu__popover">
                  <div>
                    <strong>{user?.email}</strong>
                    <span>{titleCase(user?.role ?? 'customer')}</span>
                  </div>
                  <button onClick={() => { setProfileOpen(false); navigate('/security') }} type="button">Security settings</button>
                  <button onClick={handleLogout} type="button">Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="page-container">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
