type StatusBadgeProps = {
  status: 'available' | 'attention' | 'critical' | 'operational' | string
  label: string
}

const statusColors: Record<string, string> = {
  available: 'var(--sigat-available)',
  attention: 'var(--sigat-attention)',
  critical: 'var(--sigat-critical)',
  operational: 'var(--sigat-operational)',
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span style={{ alignItems: 'center', color: 'var(--sigat-text)', display: 'inline-flex', gap: 'var(--space-1)' }}>
      <span aria-hidden="true" style={{ background: statusColors[status] ?? 'var(--sigat-muted)', borderRadius: '50%', height: '0.625rem', width: '0.625rem' }} />
      <span>{label}</span>
    </span>
  )
}
