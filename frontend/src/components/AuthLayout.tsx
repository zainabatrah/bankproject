import type { ReactNode } from 'react'
import { CheckCircle2, LockKeyhole, Radar, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from './Brand'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <div className="auth-story__glow auth-story__glow--one" />
        <div className="auth-story__glow auth-story__glow--two" />
        <Link className="auth-story__brand" to="/login">
          <Brand inverse />
        </Link>

        <div className="auth-story__content">
          <span className="auth-story__eyebrow"><ShieldCheck size={16} /> Secure by design</span>
          <h1>Your money.<br />Always defended.</h1>
          <p>
            Modern banking protected by real-time fraud intelligence, device monitoring, and bank-grade encryption.
          </p>
          <div className="auth-story__features">
            <div><Radar size={20} /><span><strong>24/7 fraud monitoring</strong><small>Every payment is risk-checked in real time</small></span></div>
            <div><LockKeyhole size={20} /><span><strong>Multi-factor security</strong><small>Extra protection where it matters most</small></span></div>
            <div><CheckCircle2 size={20} /><span><strong>You stay in control</strong><small>Clear activity, alerts, and trusted devices</small></span></div>
          </div>
        </div>

        <p className="auth-story__footer">Protected with 256-bit encryption · BankShield © 2026</p>
      </section>
      <main className="auth-main">
        <div className="auth-main__mobile-brand"><Brand /></div>
        {children}
      </main>
    </div>
  )
}
