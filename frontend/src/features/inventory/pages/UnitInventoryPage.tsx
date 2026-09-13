import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { EquipmentSummary, InventoryQuery } from '../../../shared/api/contracts'
import type { SessionContext } from '../../../shared/auth/types'
import { EquipmentDetailModal } from '../components/EquipmentDetailModal'
import { EquipmentRegistrationModal } from '../components/EquipmentRegistrationModal'
import { InventoryTable } from '../components/InventoryTable'
import { InventoryToolbar, type InventoryFilterValues } from '../components/InventoryToolbar'
import { useInventoryQuery } from '../api/inventoryQueries'

const allowedFilters = ['search', 'type', 'model', 'situation', 'unitId', 'page', 'pageSize'] as const

function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia?.('(max-width: 640px)').matches ?? false)
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 640px)')
    if (!media) return
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener?.('change', update)
    media.addListener?.(update)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      media.removeEventListener?.('change', update)
      media.removeListener?.(update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])
  return isMobile
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function readQuery(searchParams: URLSearchParams): InventoryQuery {
  return {
    search: searchParams.get('search') ?? '', type: searchParams.get('type') ?? '', model: searchParams.get('model') ?? '', situation: searchParams.get('situation') ?? '', unitId: searchParams.get('unitId') ?? '',
    page: positiveInteger(searchParams.get('page'), 1), pageSize: positiveInteger(searchParams.get('pageSize'), 10),
  }
}

export function UnitInventoryPage({ session }: { session?: SessionContext }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<EquipmentSummary | null>(null)
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false)
  const query = useMemo(() => readQuery(searchParams), [searchParams])
  const inventoryQuery = useInventoryQuery(query)
  const isMobile = useMobileViewport()
  const filters: InventoryFilterValues = { search: query.search ?? '', type: query.type ?? '', model: query.model ?? '', situation: query.situation ?? '', unitId: query.unitId ?? '' }

  function update(values: Partial<InventoryFilterValues> | Pick<InventoryQuery, 'page'>) {
    const next = new URLSearchParams()
    const nextValues = { ...query, ...values, page: 'page' in values ? values.page : 1 }
    allowedFilters.forEach((key) => {
      const value = String(nextValues[key])
      if (value && !(key === 'page' && value === '1')) next.set(key, value)
    })
    setSearchParams(next)
  }

  const isStatewide = session?.role === 'ditel_admin'
  const canRegisterEquipment = !isStatewide
  const unitName = session?.unit?.name ?? inventoryQuery.data?.items[0]?.unitName ?? 'Unidade'
  const total = inventoryQuery.data?.total ?? 0
  const attentionTotal = inventoryQuery.data?.items.filter((item) => ['maintenance', 'inactive', 'lost', 'written_off'].includes(item.situation)).length ?? 0
  const subtitle = isStatewide ? 'Escopo estadual' : `${session?.unit?.acronym ?? unitName} • ${total} equipamentos cadastrados`
  const clearFilters = () => setSearchParams(new URLSearchParams(query.pageSize === 10 ? '' : `pageSize=${query.pageSize}`))
  const showPagination = !inventoryQuery.isLoading && !inventoryQuery.isError && total > 0

  const situationStatusMap: Record<EquipmentSummary['situation'], string> = {
    active: 'available',
    maintenance: 'attention',
    inactive: 'critical',
    lost: 'critical',
    written_off: 'critical',
  }

  return <section className="inventory-page" aria-labelledby="unit-inventory-title" data-testid="inventory-layout" data-layout={isMobile ? 'mobile' : 'desktop'} data-visual-variant="operation-night">
    <header className="inventory-page__header">
      <div className="inventory-page__identity">
        <p className="page-eyebrow">{isStatewide ? 'Gestão estadual · DITEL' : 'Controle patrimonial · unidade autenticada'}</p>
        <h1 id="unit-inventory-title">
          {isStatewide ? 'Inventário estadual' : session?.unit?.name === '3º BPM' ? 'Inventário da Unidade' : `Inventário da ${unitName}`}
        </h1>
        <p>{subtitle}</p>
      </div>
      <div className="inventory-page__header-side">
        <div className="inventory-page__summary" aria-label="Resumo do inventário">
          <span><strong>Todos {total}</strong><small>equipamentos</small></span>
          <span><strong>Atenção {attentionTotal}</strong><small>itens carregados nesta página</small></span>
        </div>
        <div className="inventory-page__actions">
          <Link className="button-link" to="/relatorios">Exportar</Link>
          {canRegisterEquipment ? <button type="button" className="button-link button-link--primary" onClick={() => setIsRegistrationOpen(true)}>+ Novo equipamento</button> : null}
        </div>
      </div>
    </header>

    <div className="inventory-workspace">
      <aside className="inventory-sidebar">
        <header className="inventory-sidebar__header">
          <h2 className="inventory-sidebar__title">Filtros e seleção</h2>
          <p className="inventory-sidebar__subtitle">Encontre um ativo ou refine a consulta.</p>
        </header>

        <InventoryToolbar filters={filters} onChange={update} isStatewide={isStatewide} scopeName={isStatewide ? 'Escopo estadual' : unitName} />

        <div className="inventory-sidebar__meta">
          <span>Seleção rápida</span>
          <strong>{total} equipamentos</strong>
        </div>

        <div className="inventory-sidebar-list" aria-label="Lista rápida de equipamentos">
          {inventoryQuery.isLoading && <div className="inventory-sidebar-list__status">Carregando...</div>}
          {inventoryQuery.isError && <div className="inventory-sidebar-list__status">Erro ao carregar.</div>}
          {!inventoryQuery.isLoading && !inventoryQuery.isError && inventoryQuery.data?.items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`inventory-sidebar-item ${item.id === selected?.id ? 'is-selected' : ''}`}
              onClick={() => setSelected(item)}
            >
              <i className={`inventory-sidebar-item__dot inventory-sidebar-item__dot--${situationStatusMap[item.situation]}`} />
              <div className="inventory-sidebar-item__details">
                <strong>{item.patrimony}</strong>
                <span>{item.type} · {item.brand} {item.model}</span>
              </div>
            </button>
          ))}
        </div>

        {showPagination ? (
          <nav className="inventory-sidebar-pagination" aria-label="Paginação do inventário">
            <button
              type="button"
              className="inventory-sidebar-pagination__arrow"
              disabled={query.page <= 1}
              onClick={() => update({ page: query.page - 1 })}
              aria-label="Página anterior"
            >
              ‹
            </button>
            <div className="inventory-sidebar-pagination__numbers">
              {Array.from({ length: Math.min(5, Math.ceil(total / query.pageSize)) }, (_, i) => {
                const pageNum = i + 1
                return (
                  <button
                    key={pageNum}
                    type="button"
                    className={`inventory-sidebar-pagination__number-btn ${query.page === pageNum ? 'is-active' : ''}`}
                    onClick={() => update({ page: pageNum })}
                    aria-label={`Página ${pageNum}`}
                  >
                    {pageNum}
                  </button>
                )
              })}
              {Math.ceil(total / query.pageSize) > 5 && (
                <>
                  <span className="inventory-sidebar-pagination__dots">...</span>
                  <button
                    type="button"
                    className={`inventory-sidebar-pagination__number-btn ${query.page === Math.ceil(total / query.pageSize) ? 'is-active' : ''}`}
                    onClick={() => update({ page: Math.ceil(total / query.pageSize) })}
                    aria-label={`Página ${Math.ceil(total / query.pageSize)}`}
                  >
                    {Math.ceil(total / query.pageSize)}
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              className="inventory-sidebar-pagination__arrow"
              disabled={query.page * query.pageSize >= total}
              onClick={() => update({ page: query.page + 1 })}
              aria-label="Próxima página"
            >
              ›
            </button>
          </nav>
        ) : null}
      </aside>

      {/* Área principal direita */}
      <main className="inventory-main">
        <header className="inventory-main__header">
          <div>
            <p className="page-eyebrow">Consulta operacional</p>
            <h2>{isStatewide ? 'Equipamentos do estado' : 'Equipamentos da Unidade'}</h2>
            <p>Selecione um item para consultar detalhes, histórico e situação.</p>
          </div>
          <div className="inventory-main__result-count" aria-live="polite">
            {total} registros
          </div>
        </header>

        <div className="inventory-main__table-wrap">
          <InventoryTable
            items={inventoryQuery.data?.items ?? []}
            selectedId={selected?.id}
            loading={inventoryQuery.isLoading}
            error={inventoryQuery.isError}
            isMobile={isMobile}
            onSelect={setSelected}
            onRetry={() => { void inventoryQuery.refetch() }}
            onClearFilters={clearFilters}
          />
        </div>
      </main>
    </div>

    <EquipmentDetailModal
      equipmentId={selected?.id ?? null}
      open={Boolean(selected)}
      onClose={() => setSelected(null)}
      onOpenCall={(equipmentId) => navigate(`/chamados?equipmentId=${encodeURIComponent(equipmentId)}`)}
    />
    {canRegisterEquipment ? <EquipmentRegistrationModal open={isRegistrationOpen} onClose={() => setIsRegistrationOpen(false)} unitName={unitName} onSaved={() => { void inventoryQuery.refetch() }} /> : null}
  </section>
}
