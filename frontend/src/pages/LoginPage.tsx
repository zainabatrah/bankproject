import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, FlaskConical, LockKeyhole, Mail, ShieldAlert, UserRound } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthLayout } from '../components/AuthLayout'
import { useAuth } from '../context/AuthContext'
import { extractApiError } from '../lib/api'
import type { UserRole } from '../types'

const demoRoles: Array<{ role: UserRole; label: string; icon: typeof UserRound }> = [
  { role: 'CUSTOMER', label: 'Customer', icon: UserRound },
  { role: 'FRAUD_ANALYST', label: 'Analyst', icon: ShieldAlert },
  { role: 'ADMIN', label: 'Admin', icon: LockKeyhole },
]

export function LoginPage() {
  const { isAuthenticated, login, demoLogin } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [demoRole, setDemoRole] = useState<UserRole>('CUSTOMER')
  const [formError, setFormError] = useState('')

  if (isAuthenticated) return <Navigate replace to="/" />

  const registrationMessage = (location.state as { registered?: boolean } | null)?.registered

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    setSubmitting(true)

    try {
      const result = await login(email, password)
      if (result?.mfaRequired && result.mfaToken) {
        navigate('/mfa', { state: { mfaToken: result.mfaToken }, replace: true })
      } else {
        navigate('/', { replace: true })
      }
    } catch (error) {
      setFormError(extractApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  function enterDemo() {
    demoLogin(demoRole)
    toast.success(`Welcome to the ${demoRoles.find((item) => item.role === demoRole)?.label} demo`)
    navigate(demoRole === 'CUSTOMER' ? '/' : '/ops', { replace: true })
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <div className="auth-card__heading">
          <span className="eyebrow">Secure sign in</span>
          <h2>Welcome back</h2>
          <p>Enter your details to access your BankShield account.</p>
        </div>

        {registrationMessage && (
          <div className="inline-message inline-message--success">Your account is ready. Sign in to continue.</div>
        )}

        <form className="form-stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email address</span>
            <span className="field__control">
              <Mail size={18} />
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
            </span>
          </label>

          <label className="field">
            <span className="field__label-row"><span>Password</span><button className="text-button" type="button">Forgot password?</button></span>
            <span className="field__control">
              <LockKeyhole size={18} />
              <input
                autoComplete="current-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <button
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="field__icon-button"
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          {formError && <div className="inline-message inline-message--error" role="alert">{formError}</div>}

          <button className="button button--primary button--large button--full" disabled={submitting} type="submit">
            {submitting ? 'Signing you in…' : 'Sign in securely'}
            {!submitting && <ArrowRight size={18} />}
          </button>
        </form>

        <p className="auth-card__switch">New to BankShield? <Link to="/register">Create an account</Link></p>

        <div className="demo-access">
          <div className="demo-access__heading">
            <span><FlaskConical size={17} /> Preview without a backend</span>
            <small>Choose a role</small>
          </div>
          <div className="demo-access__roles">
            {demoRoles.map(({ role, label, icon: Icon }) => (
              <button
                className={demoRole === role ? 'active' : ''}
                key={role}
                onClick={() => setDemoRole(role)}
                type="button"
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
          <button className="button button--secondary button--full" onClick={enterDemo} type="button">
            Open interactive demo <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </AuthLayout>
  )
}
