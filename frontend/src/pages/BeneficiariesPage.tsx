import { useMemo, useState, type FormEvent } from 'react'
import { Building2, Plus, Search, Trash2, UserPlus, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState, ErrorState, LoadingState, Modal, PageHeader } from '../components/ui'
import { useBankData } from '../context/BankDataContext'
import { formatDate, initials, maskAccount } from '../lib/format'
import type { Beneficiary } from '../types'

export function BeneficiariesPage() {
  const { beneficiaries, loading, error, reload, createBeneficiary, deleteBeneficiary } = useBankData()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleting, setDeleting] = useState<Beneficiary | null>(null)
  const [name, setName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [bankName, setBankName] = useState('BankShield')
  const [submitting, setSubmitting] = useState(false)

  const filtered = useMemo(() => beneficiaries.filter((beneficiary) => `${beneficiary.name} ${beneficiary.accountNumber} ${beneficiary.bankName ?? ''}`.toLowerCase().includes(search.toLowerCase())), [beneficiaries, search])

  if (loading) return <LoadingState label="Loading your beneficiaries" />
  if (error && !beneficiaries.length) return <ErrorState message={error} onRetry={reload} />

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await createBeneficiary({ name, accountNumber, bankName: bankName || undefined })
      toast.success(`${name} was added to your beneficiaries`)
      setModalOpen(false)
      setName('')
      setAccountNumber('')
      setBankName('BankShield')
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : 'Could not add this beneficiary')
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await deleteBeneficiary(deleting.id)
      toast.success(`${deleting.name} was removed`)
      setDeleting(null)
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : 'Could not remove this beneficiary')
    }
  }

  return (
    <div className="page-stack">
      <PageHeader actions={<button className="button button--primary" onClick={() => setModalOpen(true)} type="button"><UserPlus size={17} /> Add beneficiary</button>} description="Save trusted recipients for faster, safer transfers." eyebrow="Payments" title="Beneficiaries" />

      {beneficiaries.length > 0 && <label className="search-field beneficiaries-search"><Search size={18} /><input aria-label="Search beneficiaries" onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, bank, or account" value={search} /></label>}

      {filtered.length ? (
        <section className="beneficiaries-grid">
          {filtered.map((beneficiary, index) => {
            const parts = beneficiary.name.trim().split(/\s+/)
            return (
              <article className="beneficiary-card" key={beneficiary.id}>
                <div className={`beneficiary-avatar beneficiary-avatar--${(index % 4) + 1}`}>{initials(parts[0], parts.slice(1).join(' '))}</div>
                <div className="beneficiary-card__copy"><h2>{beneficiary.name}</h2><p><Building2 size={14} /> {beneficiary.bankName || 'BankShield'}</p><span>{maskAccount(beneficiary.accountNumber)}</span><small>Added {formatDate(beneficiary.createdAt)}</small></div>
                <button aria-label={`Remove ${beneficiary.name}`} className="icon-button icon-button--danger" onClick={() => setDeleting(beneficiary)} type="button"><Trash2 size={17} /></button>
              </article>
            )
          })}
        </section>
      ) : (
        <div className="panel"><EmptyState action={!search ? <button className="button button--primary" onClick={() => setModalOpen(true)} type="button"><Plus size={17} /> Add your first beneficiary</button> : undefined} description={search ? 'Try a different name or account number.' : 'Add people or businesses you pay regularly.'} icon={<UsersRound size={25} />} title={search ? 'No matching beneficiaries' : 'No beneficiaries yet'} /></div>
      )}

      <div className="info-strip"><span><UsersRound size={19} /></span><p><strong>Built-in payment protection</strong> New beneficiaries are automatically considered during fraud analysis for your first 24 hours.</p></div>

      {modalOpen && (
        <Modal description="The account must belong to an existing BankShield customer." onClose={() => setModalOpen(false)} title="Add a beneficiary">
          <form className="modal__body form-stack" onSubmit={handleCreate}>
            <label className="field"><span>Beneficiary name</span><span className="field__control"><UsersRound size={18} /><input maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="e.g. Karim Saleh" required value={name} /></span></label>
            <label className="field"><span>Account number</span><span className="field__control"><Building2 size={18} /><input onChange={(event) => setAccountNumber(event.target.value.toUpperCase())} placeholder="BS1234567890" required value={accountNumber} /></span><small>Ask your recipient for their BankShield account number.</small></label>
            <label className="field"><span>Bank name <small>(optional)</small></span><span className="field__control"><Building2 size={18} /><input onChange={(event) => setBankName(event.target.value)} placeholder="BankShield" value={bankName} /></span></label>
            <div className="modal__actions"><button className="button button--secondary" onClick={() => setModalOpen(false)} type="button">Cancel</button><button className="button button--primary" disabled={submitting} type="submit">{submitting ? 'Adding…' : 'Add beneficiary'}</button></div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal description={`You can add ${deleting.name} again later if you change your mind.`} onClose={() => setDeleting(null)} title="Remove beneficiary?">
          <div className="modal__body"><div className="confirm-card"><span className="beneficiary-avatar">{initials(deleting.name.split(' ')[0], deleting.name.split(' ').slice(1).join(' '))}</span><div><strong>{deleting.name}</strong><small>{maskAccount(deleting.accountNumber)}</small></div></div><div className="modal__actions"><button className="button button--secondary" onClick={() => setDeleting(null)} type="button">Keep beneficiary</button><button className="button button--danger" onClick={confirmDelete} type="button"><Trash2 size={16} /> Remove</button></div></div>
        </Modal>
      )}
    </div>
  )
}
