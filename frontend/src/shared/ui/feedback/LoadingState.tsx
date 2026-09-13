type LoadingStateProps = {
  label?: string
}

export function LoadingState({ label = 'Carregando conteúdo' }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" style={{ color: 'var(--sigat-muted)', display: 'grid', gap: 'var(--space-2)' }}>
      <span>{label}</span>
      <span aria-hidden="true" style={{ background: 'var(--sigat-border)', borderRadius: 'var(--radius-sm)', display: 'block', height: '0.5rem', maxWidth: '18rem' }} />
    </div>
  )
}
