import { useState, type FormEvent } from 'react'
import { ArrowRight, Building2, Check, Copy, Eye, EyeOff, Landmark, Plus, WalletCards } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState, Modal, PageHeader } from '../components/ui'
import { useBankData } from '../context/BankDataContext'
import { formatDate, formatMoney, maskAccount } from '../lib/format'

const accountColors = ['account-card--forest', 'account-card--navy', 'account-card--plum']

export function AccountsPage() {
  const { accounts, loading, error, reload, createAccount } = useBankData()
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [currency, setCurrency] = useState<'USD' | 'EUR' | 'LBP'>('USD')
  const [submitting, setSubmitting] = useState(false)
  const [visibleBalances, setVisibleBalances] = useState(true)

  if (loading) return <LoadingState label="Loading your accounts" />
  if (error && !accounts.length) return <ErrorState message={error} onRetry={reload} />

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await createAccount(currency)
      toast.success(`${currency} account opened successfully`)
      setModalOpen(false)
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : 'Could not open this account')
    } finally {
      setSubmitting(false)
    }
  }

  function copyAccount(number: string) {
    void navigator.clipboard.writeText(number)
    toast.success('Account number copied')
  }

  return (
    <div className="page-stack">
      <PageHeader
        actions={<><button aria-label={visibleBalances ? 'Hide balances' : 'Show balances'} className="button button--secondary" onClick={() => setVisibleBalances((visible) => !visible)} type="button">{visibleBalances ? <EyeOff size={17} /> : <Eye size={17} />} {visibleBalances ? 'Hide' : 'Show'} balances</button><button className="button button--primary" onClick={() => setModalOpen(true)} type="button"><Plus size={17} /> Open account</button></>}
        description="View balances and manage your multi-currency accounts."
        eyebrow="Everyday banking"
        title="My accounts"
      />

      {accounts.length ? (
        <section className="accounts-grid">
          {accounts.map((account, index) => (
            <article className={`account-card ${accountColors[index % accountColors.length]}`} key={account.id}>
              <div className="account-card__top"><span><Landmark size={18} /> {account.currency} current account</span><small>ACTIVE</small></div>
              <div className="account-card__balance"><small>Available balance</small><strong>{visibleBalances ? formatMoney(account.balance, account.currency) : '••••••'}</strong></div>
              <div className="account-card__number"><span>{maskAccount(account.accountNumber)}</span><button aria-label="Copy account number" onClick={() => copyAccount(account.accountNumber)} type="button"><Copy size={15} /></button></div>
              <div className="account-card__footer"><small>Opened {formatDate(account.createdAt)}</small><button onClick={() => navigate('/transactions')} type="button">View activity <ArrowRight size={14} /></button></div>
            </article>
          ))}
        </section>
      ) : (
        <div className="panel"><EmptyState action={<button className="button button--primary" onClick={() => setModalOpen(true)} type="button"><Plus size={17} /> Open your first account</button>} description="Choose USD, EUR, or LBP and get an account number instantly." icon={<WalletCards size={25} />} title="Start your banking journey" /></div>
      )}

      <section className="panel account-help-panel">
        <span className="account-help-panel__icon"><Building2 size={22} /></span>
        <div><h2>One place for every currency</h2><p>Open separate accounts for the currencies you use. Transfers are supported between matching account currencies.</p></div>
        <button className="button button--secondary" onClick={() => setModalOpen(true)} type="button">Add another currency</button>
      </section>

      {modalOpen && (
        <Modal description="Choose the currency for your new current account." onClose={() => setModalOpen(false)} title="Open a new account">
          <form className="modal__body form-stack" onSubmit={handleCreate}>
            <div className="currency-picker">
              {(['USD', 'EUR', 'LBP'] as const).map((item) => (
                <button className={currency === item ? 'active' : ''} key={item} onClick={() => setCurrency(item)} type="button">
                  <span>{item === 'USD' ? '$' : item === 'EUR' ? '€' : 'ل.ل'}</span>
                  <strong>{item}</strong>
                  <small>{item === 'USD' ? 'US Dollar' : item === 'EUR' ? 'Euro' : 'Lebanese Pound'}</small>
                  {currency === item && <Check size={17} />}
                </button>
              ))}
            </div>
            <div className="inline-message inline-message--info">Your new account starts with a zero balance. There are no opening fees.</div>
            <div className="modal__actions"><button className="button button--secondary" onClick={() => setModalOpen(false)} type="button">Cancel</button><button className="button button--primary" disabled={submitting} type="submit">{submitting ? 'Opening account…' : `Open ${currency} account`}</button></div>
          </form>
        </Modal>
      )}
    </div>
  )
}
