import { useState, type FormEvent } from 'react'
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { useAuth } from '../context/AuthContext'
import { extractApiError } from '../lib/api'

export function RegisterPage() {
  const { isAuthenticated, register } = useAuth()
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  if (isAuthenticated) return <Navigate replace to="/" />

  const passwordChecks = {
    length: password.length >= 8,
    number: /\d/.test(password),
    mixed: /[a-z]/.test(password) && /[A-Z]/.test(password),
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setFormError('')
    try {
      await register({ firstName, lastName, email, password })
      navigate('/login', { replace: true, state: { registered: true } })
    } catch (error) {
      setFormError(extractApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card auth-card--register">
        <div className="auth-card__heading">
          <span className="eyebrow">Open your account</span>
          <h2>Bank with confidence</h2>
          <p>It takes less than two minutes to get started.</p>
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          <div className="form-grid form-grid--two">
            <label className="field">
              <span>First name</span>
              <span className="field__control"><UserRound size={18} /><input autoComplete="given-name" minLength={2} onChange={(event) => setFirstName(event.target.value)} placeholder="Maya" required value={firstName} /></span>
            </label>
            <label className="field">
              <span>Last name</span>
              <span className="field__control"><UserRound size={18} /><input autoComplete="family-name" minLength={2} onChange={(event) => setLastName(event.target.value)} placeholder="Haddad" required value={lastName} /></span>
            </label>
          </div>
          <label className="field">
            <span>Email address</span>
            <span className="field__control"><Mail size={18} /><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="maya@example.com" required type="email" value={email} /></span>
          </label>
          <label className="field">
            <span>Create a password</span>
            <span className="field__control">
              <LockKeyhole size={18} />
              <input autoComplete="new-password" minLength={8} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required type={showPassword ? 'text' : 'password'} value={password} />
              <button aria-label={showPassword ? 'Hide password' : 'Show password'} className="field__icon-button" onClick={() => setShowPassword((visible) => !visible)} type="button">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </span>
          </label>
          <div className="password-checks" aria-live="polite">
            <span className={passwordChecks.length ? 'passed' : ''}><Check size={14} /> 8+ characters</span>
            <span className={passwordChecks.mixed ? 'passed' : ''}><Check size={14} /> Upper & lowercase</span>
            <span className={passwordChecks.number ? 'passed' : ''}><Check size={14} /> One number</span>
          </div>
          <label className="checkbox-field">
            <input checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required type="checkbox" />
            <span>I agree to the <button className="text-button" type="button">Terms of Service</button> and <button className="text-button" type="button">Privacy Policy</button>.</span>
          </label>

          {formError && <div className="inline-message inline-message--error" role="alert">{formError}</div>}
          <button className="button button--primary button--large button--full" disabled={submitting || !accepted} type="submit">
            {submitting ? 'Creating your account…' : 'Create secure account'} {!submitting && <ArrowRight size={18} />}
          </button>
        </form>
        <p className="auth-card__switch">Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </AuthLayout>
  )
}
