import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, KeyRound, ShieldCheck } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { useAuth } from '../context/AuthContext'
import { extractApiError } from '../lib/api'

export function MfaPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated, verifyMfa, recoveryLogin } = useAuth()
  const [useRecovery, setUseRecovery] = useState(false)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const mfaToken = (location.state as { mfaToken?: string } | null)?.mfaToken

  if (isAuthenticated) return <Navigate replace to="/" />
  if (!mfaToken) return <Navigate replace to="/login" />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setFormError('')
    try {
      if (useRecovery) await recoveryLogin(mfaToken!, code)
      else await verifyMfa(mfaToken!, code)
      navigate('/', { replace: true })
    } catch (error) {
      setFormError(extractApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card auth-card--mfa">
        <Link className="back-link" to="/login"><ArrowLeft size={16} /> Back to sign in</Link>
        <div className="mfa-icon">{useRecovery ? <KeyRound size={28} /> : <ShieldCheck size={29} />}</div>
        <div className="auth-card__heading auth-card__heading--centered">
          <span className="eyebrow">Identity check</span>
          <h2>{useRecovery ? 'Use a recovery code' : 'Verify it’s you'}</h2>
          <p>{useRecovery ? 'Enter one of the recovery codes you saved when enabling MFA.' : 'Enter the 6-digit code from your authenticator app.'}</p>
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>{useRecovery ? 'Recovery code' : 'Authenticator code'}</span>
            <span className="field__control field__control--code">
              <input
                autoComplete="one-time-code"
                autoFocus
                inputMode={useRecovery ? 'text' : 'numeric'}
                maxLength={useRecovery ? 23 : 6}
                onChange={(event) => setCode(useRecovery ? event.target.value.toUpperCase() : event.target.value.replace(/\D/g, ''))}
                pattern={useRecovery ? undefined : '\\d{6}'}
                placeholder={useRecovery ? 'XXXXX-XXXXX-XXXXX-XXXXX' : '000000'}
                required
                value={code}
              />
            </span>
          </label>
          {formError && <div className="inline-message inline-message--error" role="alert">{formError}</div>}
          <button className="button button--primary button--large button--full" disabled={submitting || (!useRecovery && code.length !== 6)} type="submit">
            {submitting ? 'Verifying…' : 'Verify and continue'} {!submitting && <ArrowRight size={18} />}
          </button>
        </form>
        <button className="mfa-alternate" onClick={() => { setUseRecovery((value) => !value); setCode(''); setFormError('') }} type="button">
          {useRecovery ? 'Use my authenticator app instead' : 'I can’t access my authenticator'}
        </button>
        <p className="mfa-expiry">For your security, this sign-in request expires after 5 minutes.</p>
      </div>
    </AuthLayout>
  )
}
