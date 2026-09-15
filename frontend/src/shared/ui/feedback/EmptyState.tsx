export type EmptyStateProps = {
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ title = 'Nenhum resultado encontrado', description = 'Ajuste os critérios ou tente outra ação.', actionLabel, onAction }: EmptyStateProps) {
  return (
    <section className="empty-state" style={{ color: 'var(--sigat-muted)', display: 'grid', gap: 'var(--space-2)', textAlign: 'center' }}>
      <strong style={{ color: 'var(--sigat-text)' }}>{title}</strong>
      <span>{description}</span>
      {actionLabel && onAction && <button type="button" className="button-link" onClick={onAction}>{actionLabel}</button>}
    </section>
  )
}
