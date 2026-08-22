import { ShieldCheck } from 'lucide-react'

interface BrandProps {
  compact?: boolean
  inverse?: boolean
}

export function Brand({ compact = false, inverse = false }: BrandProps) {
  return (
    <div className={`brand-mark ${compact ? 'brand-mark--compact' : ''} ${inverse ? 'brand-mark--inverse' : ''}`}>
      <span className="brand-mark__icon" aria-hidden="true">
        <ShieldCheck size={compact ? 21 : 25} strokeWidth={2.25} />
      </span>
      <span className="brand-mark__copy">
        <strong>BankShield</strong>
        {!compact && <small>Secure digital banking</small>}
      </span>
    </div>
  )
}
