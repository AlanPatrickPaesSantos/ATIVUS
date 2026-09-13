import { useEffect, useState } from 'react'
import { getInventory } from '../../inventory/api/inventoryApi'
import { getCalls } from '../../calls/api/callsApi'
import { getAdminUsers } from '../api/administrationApi'
import { getAuditEvents } from '../../audit/api/auditApi'
import type { EquipmentSummary } from '../../../shared/api/contracts'
import type { CallQueueItem } from '../../calls/api/callsApi'
import type { AdminUserApi } from '../api/administrationApi'
import type { AuditEventItem } from '../../audit/api/auditApi'

const statusLabel: Record<string, string> = {
  active: 'Ativo', maintenance: 'Em manutenção', inactive: 'Inativo', lost: 'Extraviado', written_off: 'Baixado',
}
const priorityLabel: Record<string, string> = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' }
const callStatusLabel: Record<string, string> = { open: 'Aberto', in_progress: 'Em andamento', resolved: 'Resolvido', closed: 'Fechado' }

export function UnitInventoryPanel({ unitId }: { unitId: string }) {
  const [items, setItems] = useState<EquipmentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    getInventory({ page: 1, pageSize: 20, unitId })
      .then((response) => { if (!cancelled) setItems(response.items) })
      .catch(() => { if (!cancelled) setError('Não foi possível carregar o inventário da unidade.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [unitId])

  if (loading) return <p role="status">Carregando inventário...</p>
  if (error) return <div role="alert">{error}</div>
  if (items.length === 0) return <p>Nenhum equipamento registrado para esta unidade.</p>
  return <ul className="administration-detail__list">
    {items.map((item) => <li key={item.id}><strong>{item.patrimony}</strong> — {item.type} {item.model} <span className="tag">{statusLabel[item.situation] ?? item.situation}</span></li>)}
  </ul>
}

export function UnitCallsPanel({ unitId }: { unitId: string }) {
  const [items, setItems] = useState<CallQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    getCalls()
      .then((response) => { if (!cancelled) setItems(response.items.filter((call) => call.unitId === unitId)) })
      .catch(() => { if (!cancelled) setError('Não foi possível carregar os chamados da unidade.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [unitId])

  if (loading) return <p role="status">Carregando chamados...</p>
  if (error) return <div role="alert">{error}</div>
  if (items.length === 0) return <p>Nenhum chamado aberto para esta unidade.</p>
  return <ul className="administration-detail__list">
    {items.map((call) => <li key={call.id}><strong>{call.subject}</strong> — {priorityLabel[call.priority] ?? call.priority} · {callStatusLabel[call.status] ?? call.status}</li>)}
  </ul>
}

export function UnitUsersPanel({ unitId }: { unitId: string }) {
  const [items, setItems] = useState<AdminUserApi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    getAdminUsers({ page: 1, pageSize: 20, unitId })
      .then((response) => { if (!cancelled) setItems(response.items) })
      .catch(() => { if (!cancelled) setError('Não foi possível carregar os usuários vinculados.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [unitId])

  if (loading) return <p role="status">Carregando usuários...</p>
  if (error) return <div role="alert">{error}</div>
  if (items.length === 0) return <p>Nenhum usuário vinculado a esta unidade.</p>
  return <ul className="administration-detail__list">
    {items.map((user) => <li key={user.id}><strong>{user.name}</strong> — {user.registration} · {user.situation === 'active' ? 'Ativo' : user.situation === 'blocked' ? 'Bloqueado' : 'Inativo'}</li>)}
  </ul>
}

export function AuditPanel({ filters, emptyMessage }: { filters: { userId?: string; unitId?: string; module?: string }; emptyMessage: string }) {
  const [items, setItems] = useState<AuditEventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    getAuditEvents(filters, 1, 20)
      .then((response) => { if (!cancelled) setItems(response.items) })
      .catch(() => { if (!cancelled) setError('Não foi possível carregar os eventos de auditoria.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filters.userId, filters.unitId, filters.module])

  if (loading) return <p role="status">Carregando auditoria...</p>
  if (error) return <div role="alert">{error}</div>
  if (items.length === 0) return <p>{emptyMessage}</p>
  return <ul className="administration-detail__list">
    {items.map((event) => <li key={event.id}><strong>{event.action}</strong> — {event.module} · {event.result}{event.createdAt ? <> · {new Date(event.createdAt).toLocaleString('pt-BR')}</> : null}</li>)}
  </ul>
}

export function UnitHistoryPanel({ unitId }: { unitId: string }) {
  return <AuditPanel filters={{ unitId }} emptyMessage="Nenhum evento administrativo registrado para esta unidade." />
}

export function UserAuditPanel({ userId }: { userId: string }) {
  return <AuditPanel filters={{ userId }} emptyMessage="Nenhum evento de atividade registrado para este usuário." />
}