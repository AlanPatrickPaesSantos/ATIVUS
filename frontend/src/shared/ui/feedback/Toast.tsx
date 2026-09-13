import type { ReactNode } from 'react'

type ToastProps = {
  children: ReactNode
  tone?: 'info' | 'success' | 'warning' | 'error'
}

const toneColors = {
  info: 'var(--sigat-operational)',
  success: 'var(--sigat-available)',
  warning: 'var(--sigat-attention)',
  error: 'var(--sigat-critical)',
}

export function Toast({ children, tone = 'info' }: ToastProps) {
  return <div role="status" aria-live="polite" style={{ background: 'var(--sigat-surface)', border: `1px solid ${toneColors[tone]}`, borderRadius: 'var(--radius-md)', color: 'var(--sigat-text)', padding: 'var(--space-3)' }}>{children}</div>
}
