import type { ReactNode } from 'react'
import { Inbox, LoaderCircle } from 'lucide-react'
import { titleCase } from '../lib/format'

export function Badge({
  value,
  tone,
}: {
  value: string
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
}) {
  const normalized = value.toLowerCase().replaceAll('_', '-')
  return (
    <span className={`badge badge--${tone ?? normalized}`}>
      <span className="badge__dot" aria-hidden="true" />
      {titleCase(value)}
    </span>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-header__description">{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon ?? <Inbox size={24} />}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}

export function LoadingState({ label = 'Loading your secure workspace' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={25} />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <div>
        <strong>We couldn't load this page</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <button className="button button--secondary button--small" onClick={onRetry} type="button">
          Try again
        </button>
      )}
    </div>
  )
}

export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="modal-title"
        aria-modal="true"
        className={`modal ${wide ? 'modal--wide' : ''}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal__header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button aria-label="Close dialog" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}
