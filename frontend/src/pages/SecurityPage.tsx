import { useMemo, useState, type FormEvent } from 'react'
import {
  Activity,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Laptop,
  LockKeyhole,
  MonitorSmartphone,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge, EmptyState, Modal, PageHeader } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useBankData } from '../context/BankDataContext'
import { api, extractApiError, getDeviceId } from '../lib/api'
import { relativeTime } from '../lib/format'

interface MfaSetupResponse {
  message: string
  manualEntryKey: string
  qrCodeDataUrl: string
  instructions: string
}

interface RecoveryCodesResponse {
  message: string
  mfaEnabled?: boolean
  recoveryCodes: string[]
  warning: string
}

interface DisableMfaResponse {
  message: string
  mfaEnabled: false
  sessionsRevoked: boolean
}

type ManagementAction = 'regenerate' | 'disable'

const demoSetup: MfaSetupResponse = {
  message: 'MFA setup started',
  manualEntryKey: 'JBSWY3DPEHPK3PXP',
  qrCodeDataUrl: '',
  instructions: 'Add BankShield to your authenticator app, then verify a 6-digit code.',
}

function createDemoRecoveryCodes() {
  const alphabet = '0123456789ABCDEF'

  return Array.from({ length: 10 }, () => {
    const value = Array.from(
      { length: 20 },
      () => alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join('')

    return value.match(/.{1,5}/g)?.join('-') ?? value
  })
}

async function copyText(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(successMessage)
  } catch {
    toast.error('Clipboard access is unavailable. Select and copy the value manually.')
  }
}

function downloadRecoveryCodes(codes: string[]) {
  const content = [
    'BankShield MFA recovery codes',
    'Each code can be used once. Store this file somewhere private.',
    '',
    ...codes,
  ].join('\n')
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'bankshield-recovery-codes.txt'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  toast.success('Recovery codes downloaded')
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div className="recovery-codes" aria-label="MFA recovery codes">
      {codes.map((code, index) => (
        <button
          aria-label={`Copy recovery code ${index + 1}`}
          key={code}
          onClick={() => void copyText(code, `Recovery code ${index + 1} copied`)}
          type="button"
        >
          <span>{code}</span>
          <Copy size={14} />
        </button>
      ))}
    </div>
  )
}

export function SecurityPage() {
  const { user, isDemo, refreshUser, updateUser } = useAuth()
  const { devices } = useBankData()
  const [mfaOverride, setMfaOverride] = useState<boolean | null>(null)
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null)
  const [setupStarting, setSetupStarting] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [setupSubmitting, setSetupSubmitting] = useState(false)
  const [setupError, setSetupError] = useState('')
  const [setupRecoveryCodes, setSetupRecoveryCodes] = useState<string[]>([])
  const [setupCodesSaved, setSetupCodesSaved] = useState(false)
  const [managementAction, setManagementAction] = useState<ManagementAction | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [managementCode, setManagementCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [managementSubmitting, setManagementSubmitting] = useState(false)
  const [managementError, setManagementError] = useState('')
  const [replacementCodes, setReplacementCodes] = useState<string[]>([])
  const [replacementCodesSaved, setReplacementCodesSaved] = useState(false)

  const mfaEnabled = mfaOverride ?? Boolean(user?.mfaEnabled)
  const currentDeviceId = useMemo(() => getDeviceId(), [])
  const visibleDevices = isDemo ? devices : []

  async function syncMfaState(enabled: boolean) {
    setMfaOverride(enabled)
    updateUser({ mfaEnabled: enabled })

    if (!isDemo) {
      try {
        await refreshUser()
        setMfaOverride(null)
      } catch {
        toast.warning('Your security change was saved, but account details could not be refreshed.')
      }
    }
  }

  async function startMfaSetup() {
    setSetupStarting(true)
    setSetupError('')

    try {
      const data = isDemo
        ? demoSetup
        : (await api.post<MfaSetupResponse>('/auth/mfa/setup')).data
      setSetup(data)
      setVerificationCode('')
      setSetupRecoveryCodes([])
      setSetupCodesSaved(false)
    } catch (error) {
      toast.error(extractApiError(error, 'MFA setup could not be started.'))
    } finally {
      setSetupStarting(false)
    }
  }

  async function verifyMfaSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!/^\d{6}$/.test(verificationCode)) return

    setSetupSubmitting(true)
    setSetupError('')

    try {
      const data: RecoveryCodesResponse = isDemo
        ? {
            message: 'MFA enabled successfully',
            mfaEnabled: true,
            recoveryCodes: createDemoRecoveryCodes(),
            warning: 'Save these recovery codes now. They will not be shown again.',
          }
        : (await api.post<RecoveryCodesResponse>('/auth/mfa/verify-setup', {
            code: verificationCode,
          })).data

      setSetupRecoveryCodes(data.recoveryCodes)
      await syncMfaState(true)
      toast.success('Multi-factor authentication is now active')
    } catch (error) {
      setSetupError(extractApiError(error, 'The authenticator code could not be verified.'))
    } finally {
      setSetupSubmitting(false)
    }
  }

  function resetSetup() {
    setSetup(null)
    setVerificationCode('')
    setSetupError('')
    setSetupRecoveryCodes([])
    setSetupCodesSaved(false)
  }

  function closeSetup() {
    if (setupRecoveryCodes.length && !setupCodesSaved) {
      toast.info('Confirm that you saved your recovery codes before closing this window.')
      return
    }

    resetSetup()
  }

  function openManagement(action: ManagementAction) {
    setManagementAction(action)
    setCurrentPassword('')
    setManagementCode('')
    setShowPassword(false)
    setManagementError('')
    setReplacementCodes([])
    setReplacementCodesSaved(false)
  }

  function closeManagement() {
    if (replacementCodes.length && !replacementCodesSaved) {
      toast.info('Confirm that you saved your new recovery codes before closing this window.')
      return
    }

    setManagementAction(null)
    setCurrentPassword('')
    setManagementCode('')
    setManagementError('')
    setReplacementCodes([])
    setReplacementCodesSaved(false)
  }

  async function submitManagementAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!managementAction || !/^\d{6}$/.test(managementCode)) return

    setManagementSubmitting(true)
    setManagementError('')

    try {
      if (managementAction === 'regenerate') {
        const data: RecoveryCodesResponse = isDemo
          ? {
              message: 'MFA recovery codes regenerated successfully',
              recoveryCodes: createDemoRecoveryCodes(),
              warning: 'Previous recovery codes no longer work.',
            }
          : (await api.post<RecoveryCodesResponse>('/auth/mfa/recovery-codes/regenerate', {
              currentPassword,
              code: managementCode,
            })).data

        setReplacementCodes(data.recoveryCodes)
        toast.success('New recovery codes created; previous codes are no longer valid')
      } else {
        if (!isDemo) {
          await api.post<DisableMfaResponse>('/auth/mfa/disable', {
            currentPassword,
            code: managementCode,
          })
        }

        await syncMfaState(false)
        setManagementAction(null)
        toast.success('Multi-factor authentication disabled')
      }
    } catch (error) {
      setManagementError(extractApiError(error, `MFA could not be ${managementAction === 'disable' ? 'disabled' : 'updated'}.`))
    } finally {
      setManagementSubmitting(false)
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        description="Control how you sign in and review the safeguards protecting your account."
        eyebrow="Account protection"
        title="Security center"
      />

      <section className={`security-hero ${mfaEnabled ? 'security-hero--protected' : ''}`}>
        <span className="security-hero__icon">
          {mfaEnabled ? <ShieldCheck size={30} /> : <ShieldAlert size={30} />}
        </span>
        <div className="security-hero__copy">
          <Badge tone={mfaEnabled ? 'success' : 'warning'} value={mfaEnabled ? 'Strong protection' : 'Action recommended'} />
          <h2>{mfaEnabled ? 'Your account has an extra layer of protection' : 'Strengthen your sign-in security'}</h2>
          <p>
            {mfaEnabled
              ? 'An authenticator code is required after your password, helping keep your account safe even if your password is exposed.'
              : 'Turn on multi-factor authentication to require a one-time code whenever you sign in.'}
          </p>
        </div>
        {!mfaEnabled && (
          <button className="button button--primary" disabled={setupStarting} onClick={() => void startMfaSetup()} type="button">
            <Fingerprint size={18} /> {setupStarting ? 'Preparing setup…' : 'Enable MFA'}
          </button>
        )}
      </section>

      <section className="quick-stats security-stats" aria-label="Protection summary">
        <article>
          <span className="quick-stat__icon quick-stat__icon--green"><Activity size={20} /></span>
          <div><small>Fraud monitoring</small><strong>Active</strong></div>
          <CheckCircle2 size={18} />
        </article>
        <article>
          <span className="quick-stat__icon quick-stat__icon--blue"><LockKeyhole size={20} /></span>
          <div><small>Account status</small><strong>{user?.status === 'ACTIVE' ? 'Secure' : user?.status ?? 'Unknown'}</strong></div>
          <CheckCircle2 size={18} />
        </article>
        <article>
          <span className="quick-stat__icon quick-stat__icon--amber"><KeyRound size={20} /></span>
          <div><small>Authenticator</small><strong>{mfaEnabled ? 'Enabled' : 'Not enabled'}</strong></div>
          {mfaEnabled ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}
        </article>
      </section>

      <section className="security-content-grid">
        <article className="panel security-settings-card">
          <div className="panel__heading">
            <div>
              <p className="panel__eyebrow">Sign-in protection</p>
              <h2>Multi-factor authentication</h2>
              <p>Use a time-based code from your authenticator app.</p>
            </div>
            <Badge tone={mfaEnabled ? 'success' : 'neutral'} value={mfaEnabled ? 'Enabled' : 'Disabled'} />
          </div>

          <div className="security-setting-row">
            <span className={`security-setting-row__icon ${mfaEnabled ? 'security-setting-row__icon--active' : ''}`}>
              <Fingerprint size={22} />
            </span>
            <div>
              <strong>Authenticator app</strong>
              <p>{mfaEnabled ? 'Required each time your password is verified.' : 'Compatible with any TOTP authenticator app.'}</p>
            </div>
            {mfaEnabled ? (
              <div className="security-setting-row__actions">
                <button className="button button--secondary button--small" onClick={() => openManagement('regenerate')} type="button">
                  <RefreshCw size={15} /> New recovery codes
                </button>
                <button className="button button--ghost button--small" onClick={() => openManagement('disable')} type="button">
                  Disable
                </button>
              </div>
            ) : (
              <button className="button button--secondary button--small" disabled={setupStarting} onClick={() => void startMfaSetup()} type="button">
                Set up
              </button>
            )}
          </div>

          <div className="inline-message inline-message--info">
            <ShieldCheck size={17} /> BankShield never asks for an authenticator or recovery code outside the secure sign-in and security flows.
          </div>
        </article>

        <article className="panel device-card">
          <div className="panel__heading">
            <div>
              <p className="panel__eyebrow">Sessions & devices</p>
              <h2>Recognized devices</h2>
              <p>Devices are registered when you successfully sign in.</p>
            </div>
            <MonitorSmartphone size={22} />
          </div>

          {visibleDevices.length ? (
            <div className="device-list">
              {visibleDevices.map((device, index) => (
                <div className="device-row" key={device.id}>
                  <span className="device-row__icon">{device.os?.includes('iOS') || device.os?.includes('Android') ? <Smartphone size={20} /> : <Laptop size={20} />}</span>
                  <div>
                    <strong>{device.browser || 'Unknown browser'} on {device.os || 'Unknown OS'}</strong>
                    <small>{index === 0 ? 'Current demo device' : `Last seen ${relativeTime(device.lastSeen)}`}</small>
                  </div>
                  <Badge tone={device.trusted ? 'success' : 'warning'} value={device.trusted ? 'Trusted' : 'Untrusted'} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              description="This API records devices at sign-in but does not yet expose a device inventory or session-revocation endpoint. Your current browser remains registered automatically."
              icon={<Laptop size={24} />}
              title="Device management is coming soon"
            />
          )}

          <div className="current-session">
            <span><Clock3 size={17} /></span>
            <div><strong>Current browser session</strong><small>Device ID ending in {currentDeviceId.slice(-8)}</small></div>
            <Badge tone="info" value="Current" />
          </div>
        </article>
      </section>

      {setup && (
        <Modal
          description={setupRecoveryCodes.length ? 'These one-time codes are the only backup way into your account.' : 'Connect an authenticator app, then verify one code.'}
          onClose={closeSetup}
          title={setupRecoveryCodes.length ? 'Save your recovery codes' : 'Set up an authenticator'}
          wide
        >
          {setupRecoveryCodes.length ? (
            <div className="modal__body form-stack">
              <div className="inline-message inline-message--warning"><ShieldAlert size={18} /> Save these codes now. BankShield will not show them again.</div>
              <RecoveryCodes codes={setupRecoveryCodes} />
              <div className="recovery-code-actions">
                <button className="button button--secondary" onClick={() => void copyText(setupRecoveryCodes.join('\n'), 'All recovery codes copied')} type="button"><Copy size={16} /> Copy all</button>
                <button className="button button--secondary" onClick={() => downloadRecoveryCodes(setupRecoveryCodes)} type="button"><Download size={16} /> Download .txt</button>
              </div>
              <label className="check-field"><input checked={setupCodesSaved} onChange={(event) => setSetupCodesSaved(event.target.checked)} type="checkbox" /><span><Check size={15} /> I saved these codes somewhere private</span></label>
              <div className="modal__actions"><button className="button button--primary" disabled={!setupCodesSaved} onClick={resetSetup} type="button">Finish setup</button></div>
            </div>
          ) : (
            <form className="modal__body form-stack" onSubmit={verifyMfaSetup}>
              <div className="mfa-setup-grid">
                <div className="mfa-setup-qr">
                  {setup.qrCodeDataUrl ? <img alt="BankShield authenticator QR code" src={setup.qrCodeDataUrl} /> : <span><QrCode size={90} /><small>Demo QR preview</small></span>}
                </div>
                <div className="mfa-setup-instructions">
                  <ol>
                    <li>Open your authenticator app and add a new account.</li>
                    <li>Scan the QR code or enter the setup key manually.</li>
                    <li>Enter the six-digit code shown by the app.</li>
                  </ol>
                  <div className="manual-key">
                    <span><small>Manual setup key</small><code>{setup.manualEntryKey}</code></span>
                    <button aria-label="Copy manual setup key" onClick={() => void copyText(setup.manualEntryKey, 'Setup key copied')} type="button"><Copy size={16} /></button>
                  </div>
                </div>
              </div>
              <label className="field">
                <span>Authenticator code</span>
                <span className="field__control field__control--code"><input autoComplete="one-time-code" autoFocus inputMode="numeric" maxLength={6} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ''))} pattern="\d{6}" placeholder="000000" required value={verificationCode} /></span>
              </label>
              {setupError && <div className="inline-message inline-message--error" role="alert">{setupError}</div>}
              <div className="modal__actions"><button className="button button--secondary" onClick={closeSetup} type="button">Cancel</button><button className="button button--primary" disabled={setupSubmitting || verificationCode.length !== 6} type="submit">{setupSubmitting ? 'Verifying…' : 'Verify and enable MFA'}</button></div>
            </form>
          )}
        </Modal>
      )}

      {managementAction && (
        <Modal
          description={managementAction === 'disable' ? 'Confirm your password and a current authenticator code.' : 'Your existing recovery codes will stop working immediately.'}
          onClose={closeManagement}
          title={replacementCodes.length ? 'Save your new recovery codes' : managementAction === 'disable' ? 'Disable multi-factor authentication' : 'Generate new recovery codes'}
          wide={Boolean(replacementCodes.length)}
        >
          {replacementCodes.length ? (
            <div className="modal__body form-stack">
              <div className="inline-message inline-message--warning"><ShieldAlert size={18} /> Previous recovery codes no longer work. Save this new set now.</div>
              <RecoveryCodes codes={replacementCodes} />
              <div className="recovery-code-actions">
                <button className="button button--secondary" onClick={() => void copyText(replacementCodes.join('\n'), 'All recovery codes copied')} type="button"><Copy size={16} /> Copy all</button>
                <button className="button button--secondary" onClick={() => downloadRecoveryCodes(replacementCodes)} type="button"><Download size={16} /> Download .txt</button>
              </div>
              <label className="check-field"><input checked={replacementCodesSaved} onChange={(event) => setReplacementCodesSaved(event.target.checked)} type="checkbox" /><span><Check size={15} /> I saved these replacement codes</span></label>
              <div className="modal__actions"><button className="button button--primary" disabled={!replacementCodesSaved} onClick={closeManagement} type="button">Done</button></div>
            </div>
          ) : (
            <form className="modal__body form-stack" onSubmit={submitManagementAction}>
              {managementAction === 'disable' && <div className="inline-message inline-message--warning"><ShieldAlert size={18} /> Disabling MFA deletes your recovery codes and revokes active refresh sessions. You may need to sign in again.</div>}
              <label className="field">
                <span>Current password</span>
                <span className="field__control"><LockKeyhole size={18} /><input autoComplete="current-password" onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Enter your current password" required type={showPassword ? 'text' : 'password'} value={currentPassword} /><button aria-label={showPassword ? 'Hide password' : 'Show password'} className="field__icon-button" onClick={() => setShowPassword((visible) => !visible)} type="button">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>
              </label>
              <label className="field">
                <span>Authenticator code</span>
                <span className="field__control field__control--code"><input autoComplete="one-time-code" inputMode="numeric" maxLength={6} onChange={(event) => setManagementCode(event.target.value.replace(/\D/g, ''))} pattern="\d{6}" placeholder="000000" required value={managementCode} /></span>
              </label>
              {managementError && <div className="inline-message inline-message--error" role="alert">{managementError}</div>}
              <div className="modal__actions"><button className="button button--secondary" onClick={closeManagement} type="button">Cancel</button><button className={`button ${managementAction === 'disable' ? 'button--danger' : 'button--primary'}`} disabled={managementSubmitting || managementCode.length !== 6 || !currentPassword} type="submit">{managementSubmitting ? 'Confirming…' : managementAction === 'disable' ? 'Disable MFA' : 'Generate new codes'}</button></div>
            </form>
          )}
        </Modal>
      )}
    </div>
  )
}
