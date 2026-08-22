import { useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Send, ShieldCheck, UserPlus, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ErrorState, LoadingState, PageHeader } from '../components/ui'
import { useBankData } from '../context/BankDataContext'
import { formatMoney, initials, maskAccount } from '../lib/format'

type TransferResult = { message?: string; transaction?: { status?: string; reference?: string }; fraudAnalysis?: { risk_score?: number; risk_level?: string } }

export function TransferPage() {
  const { accounts, beneficiaries, loading, error, reload, transfer } = useBankData()
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [accountId, setAccountId] = useState('')
  const [beneficiaryId, setBeneficiaryId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<TransferResult | null>(null)

  const account = useMemo(() => accounts.find((item) => item.id === Number(accountId)), [accountId, accounts])
  const beneficiary = useMemo(() => beneficiaries.find((item) => item.id === Number(beneficiaryId)), [beneficiaries, beneficiaryId])
  const numericAmount = Number(amount)

  if (loading) return <LoadingState label="Preparing secure transfers" />
  if (error && !accounts.length) return <ErrorState message={error} onRetry={reload} />

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!account || !beneficiary || numericAmount <= 0) return
    if (numericAmount > Number(account.balance)) {
      toast.error('This amount is higher than your available balance')
      return
    }
    setStep(2)
  }

  async function confirmTransfer() {
    if (!account || !beneficiary) return
    setSubmitting(true)
    try {
      const response = await transfer({ senderAccountId: account.id, beneficiaryId: beneficiary.id, amount: numericAmount, description: description.trim() || undefined }) as TransferResult
      setResult(response)
      setStep(3)
    } catch (transferError) {
      toast.error(transferError instanceof Error ? transferError.message : 'The transfer could not be completed')
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setStep(1); setAccountId(''); setBeneficiaryId(''); setAmount(''); setDescription(''); setResult(null)
  }

  return (
    <div className="page-stack transfer-page">
      <PageHeader description="Send money to a saved beneficiary with real-time fraud protection." eyebrow="Secure payments" title="Transfer money" />
      <div className="transfer-layout">
        <section className="panel transfer-panel">
          <ol className="stepper" aria-label="Transfer progress">
            <li className={step >= 1 ? 'active' : ''}><span>{step > 1 ? '✓' : '1'}</span><small>Details</small></li><li className={step >= 2 ? 'active' : ''}><span>{step > 2 ? '✓' : '2'}</span><small>Review</small></li><li className={step >= 3 ? 'active' : ''}><span>3</span><small>Complete</small></li>
          </ol>

          {step === 1 && (
            <form className="transfer-form form-stack" onSubmit={review}>
              {!accounts.length || !beneficiaries.length ? (
                <div className="transfer-prerequisite">
                  <span>{!accounts.length ? <WalletCards size={24} /> : <UserPlus size={24} />}</span>
                  <div><h2>{!accounts.length ? 'Open an account first' : 'Add a beneficiary first'}</h2><p>{!accounts.length ? 'You need an account before you can send money.' : 'Save the recipient before starting a secure transfer.'}</p></div>
                  <button className="button button--primary" onClick={() => navigate(!accounts.length ? '/accounts' : '/beneficiaries')} type="button">{!accounts.length ? 'Open account' : 'Add beneficiary'}</button>
                </div>
              ) : (
                <>
                  <div className="transfer-form__heading"><span>1</span><div><h2>Payment details</h2><p>Choose where to send your money.</p></div></div>
                  <label className="field"><span>From account</span><span className="field__control field__control--select"><WalletCards size={18} /><select onChange={(event) => setAccountId(event.target.value)} required value={accountId}><option value="">Select an account</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.currency} · {maskAccount(item.accountNumber)} · {formatMoney(item.balance, item.currency)}</option>)}</select><ChevronDown size={17} /></span></label>
                  <label className="field"><span>Beneficiary</span><span className="field__control field__control--select"><UserPlus size={18} /><select onChange={(event) => setBeneficiaryId(event.target.value)} required value={beneficiaryId}><option value="">Select a beneficiary</option>{beneficiaries.map((item) => <option key={item.id} value={item.id}>{item.name} · {maskAccount(item.accountNumber)}</option>)}</select><ChevronDown size={17} /></span></label>
                  <label className="field"><span>Amount</span><span className="money-input"><strong>{account?.currency === 'EUR' ? '€' : account?.currency === 'LBP' ? 'ل.ل' : '$'}</strong><input inputMode="decimal" min="0.01" onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required step="0.01" type="number" value={amount} /><small>{account?.currency ?? 'USD'}</small></span>{account && <small>Available: {formatMoney(account.balance, account.currency)}</small>}</label>
                  <label className="field"><span>Payment note <small>(optional)</small></span><span className="field__control"><input maxLength={255} onChange={(event) => setDescription(event.target.value)} placeholder="What is this payment for?" value={description} /></span></label>
                  <button className="button button--primary button--large button--full" type="submit">Review transfer <ArrowRight size={18} /></button>
                </>
              )}
            </form>
          )}

          {step === 2 && account && beneficiary && (
            <div className="transfer-review">
              <button className="back-link" onClick={() => setStep(1)} type="button"><ArrowLeft size={16} /> Edit details</button>
              <div className="transfer-review__hero"><span className="beneficiary-avatar">{initials(beneficiary.name.split(' ')[0], beneficiary.name.split(' ').slice(1).join(' '))}</span><small>You’re sending</small><strong>{formatMoney(numericAmount, account.currency)}</strong><p>to {beneficiary.name}</p></div>
              <dl className="detail-list"><div><dt>From</dt><dd>{account.currency} account · {maskAccount(account.accountNumber)}</dd></div><div><dt>To</dt><dd>{beneficiary.name} · {maskAccount(beneficiary.accountNumber)}</dd></div><div><dt>Note</dt><dd>{description || 'No payment note'}</dd></div><div><dt>Fee</dt><dd>{formatMoney(0, account.currency)}</dd></div><div className="detail-list__total"><dt>Total</dt><dd>{formatMoney(numericAmount, account.currency)}</dd></div></dl>
              <div className="inline-message inline-message--info"><ShieldCheck size={18} /> This transfer will be screened by BankShield fraud intelligence before processing.</div>
              <button className="button button--primary button--large button--full" disabled={submitting} onClick={confirmTransfer} type="button">{submitting ? 'Screening and sending…' : 'Confirm and send'} {!submitting && <Send size={18} />}</button>
            </div>
          )}

          {step === 3 && account && beneficiary && (
            <div className={`transfer-success ${result?.transaction?.status === 'FLAGGED' ? 'transfer-success--flagged' : ''}`}>
              <span className="transfer-success__icon"><CheckCircle2 size={35} /></span>
              <span className="eyebrow">{result?.transaction?.status === 'FLAGGED' ? 'Security review' : 'Transfer complete'}</span>
              <h2>{result?.transaction?.status === 'FLAGGED' ? 'Your transfer is being reviewed' : 'Money sent successfully'}</h2>
              <p>{result?.message || `${formatMoney(numericAmount, account.currency)} was sent to ${beneficiary.name}.`}</p>
              <div className="transfer-success__receipt"><span><small>Amount</small><strong>{formatMoney(numericAmount, account.currency)}</strong></span><span><small>Recipient</small><strong>{beneficiary.name}</strong></span><span><small>Reference</small><strong>{result?.transaction?.reference?.slice(0, 18) || 'DEMO-TRANSFER'}</strong></span></div>
              <div className="transfer-success__actions"><button className="button button--secondary" onClick={() => navigate('/transactions')} type="button">View transactions</button><button className="button button--primary" onClick={reset} type="button">Make another transfer</button></div>
            </div>
          )}
        </section>

        <aside className="transfer-assurance">
          <span><ShieldCheck size={21} /></span><div><h3>Protected every step</h3><p>We check the device, beneficiary age, amount, frequency, and time of every payment.</p></div>
          <ul><li><span>1</span><div><strong>Encrypted</strong><small>Your payment details stay private.</small></div></li><li><span>2</span><div><strong>Risk screened</strong><small>Suspicious transfers pause safely.</small></div></li><li><span>3</span><div><strong>Instant record</strong><small>Every action has a traceable reference.</small></div></li></ul>
        </aside>
      </div>
    </div>
  )
}
