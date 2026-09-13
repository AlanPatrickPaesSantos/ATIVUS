import type { ReactNode } from 'react'

type ErrorStateProps = {
  message?: string
  onRetry?: () => void
  details?: ReactNode
}

export function ErrorState({ message = 'Não foi possível carregar este conteúdo.', onRetry, details }: ErrorStateProps) {
  return (
    <section role="alert" style={{ border: '1px solid var(--sigat-critical)', borderRadius: 'var(--radius-md)', color: 'var(--sigat-text)', display: 'grid', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
      <span>{message}</span>
      {onRetry && <button type="button" onClick={onRetry}>Tentar novamente</button>}
      {details && <details><summary>Detalhes técnicos</summary>{details}</details>}
    </section>
  )
}
