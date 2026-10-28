import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { DashboardFilters } from '../../../shared/api/contracts'
import { useInventoryFacetsQuery, useOrganizationalFilterOptionsQuery } from '../../inventory/api/inventoryQueries'
import { useDashboardQuery } from '../api/dashboardQueries'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'

type Tone = 'operational' | 'available' | 'attention' | 'critical'

type Situation = {
  situation: string
  label: string
  count: number
}

type UnitSummary = {
  unit: { id: string; name: string; acronym: string }
  coverage: string
  equipmentShare?: string
  equipment: number
  attention: number
  attentionPercent?: number
  organizationType?: 'intermediate_command' | 'subordinate_unit'
}

type CallsByStatus = {
  status: string
  label: string
  count: number
}

type CommandSummary = {
  command: { id: string; name: string; acronym: string }
  equipment: number
  attention: number
  attentionPercent: number
}

type RecentMovement = {
  id: string
  equipmentId: string
  origin: { name: string }
  destination: { name: string }
  status: string
  occurredAt: string
}

const situationTone: Record<string, Tone> = {
  active: 'available',
  maintenance: 'attention',
  inactive: 'critical',
  attention: 'critical',
}

function formatNumber(value: number) {
  return value.toLocaleString('pt-BR')
}

function percent(part: number, total: number) {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

function barWidth(value: number, max: number) {
  if (max <= 0) return '0%'
  return `${Math.max(6, Math.round((value / max) * 100))}%`
}

export function DitelDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false)
  const [showAllUnits, setShowAllUnits] = useState(false)
  const [showAllRanking, setShowAllRanking] = useState(false)
  const filters = useMemo<DashboardFilters>(() => ({
    unitId: searchParams.get('unitId') || undefined,
    commandId: searchParams.get('commandId') || undefined,
    situation: (searchParams.get('situation') as DashboardFilters['situation']) || undefined,
    municipality: searchParams.get('municipality') || undefined,
    region: searchParams.get('region') || undefined,
    type: searchParams.get('type') || undefined,
    section: searchParams.get('section') || undefined,
    period: (searchParams.get('period') as DashboardFilters['period']) || '30d',
  }), [searchParams])
  const dashboardQuery = useDashboardQuery(filters)
  const facetsQuery = useInventoryFacetsQuery({ commandId: filters.commandId, unitId: filters.unitId, municipality: filters.municipality, region: filters.region, type: filters.type, model: filters.model, section: filters.section, period: filters.period })
  const organizationalOptionsQuery = useOrganizationalFilterOptionsQuery()
  const data = dashboardQuery.data

  const units = useMemo(() => (data?.unitSummaries ?? []) as UnitSummary[], [data?.unitSummaries])
  const unitAttentionPercent = (unit: UnitSummary) => unit.attentionPercent ?? percent(unit.attention, unit.equipment)

  const sortedUnits = useMemo(() => {
    return [...units].sort((a, b) => unitAttentionPercent(b) - unitAttentionPercent(a) || b.attention - a.attention || b.equipment - a.equipment || a.unit.name.localeCompare(b.unit.name))
  }, [units])

  const callsByStatus = (data?.callsByStatus ?? []) as CallsByStatus[]
  const recentMovements = (data?.recentMovements ?? []) as RecentMovement[]
  const commandSummaries = (data?.commandSummaries ?? []) as CommandSummary[]
  const situations = (data?.situations ?? []) as Situation[]
  const monitoredUnits = data?.monitoredUnits ?? 0
  const total = data?.metrics.total ?? 0
  const active = data?.metrics.active ?? 0
  const maintenance = data?.metrics.maintenance ?? 0
  const inactive = situations.find((item) => item.situation === 'inactive')?.count ?? 0
  const attention = data?.metrics.attention ?? 0
  const operationalIndicators = data?.operationalIndicators ?? {
    total,
    active,
    maintenance,
    inactive,
    lost: situations.find((item) => item.situation === 'lost')?.count ?? 0,
    writtenOff: situations.find((item) => item.situation === 'written_off')?.count ?? 0,
    attention,
    attentionPercent: percent(attention, total),
  }
  const healthPercent = percent(operationalIndicators.active, operationalIndicators.total)
  const maxCallCount = Math.max(...callsByStatus.map((item) => item.count), 0)
  const hasQueryFeedback = dashboardQuery.isLoading || dashboardQuery.isError
  const selectedCommand = organizationalOptionsQuery.data?.commands.find((command) => command.id === filters.commandId)
  const unitOptions = filters.commandId ? (selectedCommand?.units ?? []) : (organizationalOptionsQuery.data?.units ?? facetsQuery.data?.units ?? (data?.unitSummaries ?? []).map((item) => item.unit))
  const inventorySearch = useMemo(() => {
    const next = new URLSearchParams()
    for (const key of ['commandId', 'unitId', 'municipality', 'region', 'type', 'model', 'section', 'period'] as const) {
      const value = filters[key]
      if (value && (key !== 'period' || searchParams.has('period'))) next.set(key, value)
    }
    return next.toString() ? `?${next.toString()}` : ''
  }, [filters, searchParams])
  const sortedCommandSummaries = useMemo(() => {
    return [...commandSummaries].sort((a, b) => b.attentionPercent - a.attentionPercent || b.attention - a.attention || b.equipment - a.equipment || a.command.name.localeCompare(b.command.name))
  }, [commandSummaries])
  const setFilter = (key: keyof DashboardFilters, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (!value || value === 'all' || value === 'statewide') next.delete(key)
    else next.set(key, value)
    if (key === 'commandId') next.delete('unitId')
    setSearchParams(next)
  }

  const primaryMetrics = data
    ? [
        { label: 'Equipamentos cadastrados', value: formatNumber(operationalIndicators.total), tone: 'operational' as Tone },
        { label: 'Em operação', value: formatNumber(operationalIndicators.active), tone: 'available' as Tone },
        { label: 'Equipamentos em atenção', value: formatNumber(operationalIndicators.attention), tone: 'attention' as Tone },
        { label: '% em atenção', value: `${operationalIndicators.attentionPercent}%`, tone: 'attention' as Tone },
      ]
    : []
  const secondaryMetrics = data
    ? [
        { label: 'Em manutenção', value: formatNumber(operationalIndicators.maintenance), tone: 'attention' as Tone },
        { label: 'Inativos', value: formatNumber(operationalIndicators.inactive), tone: 'critical' as Tone },
        { label: 'Perdidos', value: formatNumber(operationalIndicators.lost), tone: 'critical' as Tone },
        { label: 'Baixados', value: formatNumber(operationalIndicators.writtenOff), tone: 'critical' as Tone },
        { label: 'Chamados críticos', value: formatNumber(data.criticalCalls ?? 0), tone: 'critical' as Tone },
        { label: 'Movimentações pendentes', value: formatNumber(data.pendingMovements ?? 0), tone: 'operational' as Tone },
      ]
    : []
  const visibleUnits = showAllUnits ? units : units.slice(0, 5)
  const visibleRanking = showAllRanking ? sortedUnits : sortedUnits.slice(0, 5)
  const maxCommandAttention = Math.max(...sortedCommandSummaries.map((item) => item.attentionPercent), 0)

  function clearAdvancedFilters() { setSearchParams(new URLSearchParams()) }

  return (
    <section
      className="module-page ditel-dashboard-page"
      data-testid="ditel-operations-console"
      data-visual-variant="statewide-operations-console"
      aria-labelledby="ditel-dashboard-title"
    >
      <header className="module-page__header">
        <div>
          <h1 id="ditel-dashboard-title">Painel estadual</h1>
        </div>
        <Link className="button-link button-link--primary" to="/relatorios">
          Gerar relatório
        </Link>
      </header>

      {dashboardQuery.isLoading ? <LoadingState label="Carregando painel estadual" /> : null}
      {dashboardQuery.isError ? (
        <ErrorState
          message="Não foi possível carregar o painel estadual."
          onRetry={() => {
            void dashboardQuery.refetch()
          }}
        />
      ) : null}

      <section className="module-panel ditel-filters" aria-label="Filtros estaduais">
        <div className="ditel-filters__primary">
          <label>
            Comando intermediário
            <select aria-label="Comando intermediário" value={filters.commandId ?? 'statewide'} onChange={(event) => setFilter('commandId', event.target.value)}>
              <option value="statewide">Todos os comandos</option>
              {(organizationalOptionsQuery.data?.commands ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          {organizationalOptionsQuery.isLoading ? <span role="status">Carregando comandos e unidades subordinadas...</span> : null}
          <label>
            Unidade subordinada
            <select aria-label="Unidade subordinada" value={filters.unitId ?? 'statewide'} onChange={(event) => setFilter('unitId', event.target.value)}>
              <option value="statewide">Todas as unidades do comando</option>
              {unitOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              {filters.commandId && selectedCommand && selectedCommand.units.length === 0 ? <option value="" disabled>Nenhuma unidade subordinada cadastrada</option> : null}
            </select>
          </label>
          <label>
            Situação do parque
            <select value={filters.situation ?? 'all'} onChange={(event) => setFilter('situation', event.target.value)}>
              <option value="all">Todas as situações</option>
              <option value="attention">Com atenção</option>
              {(facetsQuery.data?.situations ?? []).map((item) => <option key={item} value={item}>{item === 'active' ? 'Em operação' : item === 'maintenance' ? 'Em manutenção' : item === 'inactive' ? 'Inativo' : item === 'lost' ? 'Extraviado' : 'Baixado'}</option>)}
            </select>
          </label>
          <button
            className="button-link"
            type="button"
            aria-expanded={isAdvancedFiltersOpen}
            aria-controls="ditel-advanced-filters"
            onClick={() => setIsAdvancedFiltersOpen((open) => !open)}
          >
            Filtros avançados
          </button>
        </div>
        {isAdvancedFiltersOpen ? (
          <div id="ditel-advanced-filters" className="ditel-filters__advanced">
            <label>
              Município
              <select value={filters.municipality ?? 'all'} onChange={(event) => setFilter('municipality', event.target.value)}>
                <option value="all">Todos os municípios</option>
                {(facetsQuery.data?.municipalities ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Região
              <select value={filters.region ?? 'all'} onChange={(event) => setFilter('region', event.target.value)}>
                <option value="all">Todas as regiões</option>
                {(facetsQuery.data?.regions ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Tipo de equipamento
              <select value={filters.type ?? 'all'} onChange={(event) => setFilter('type', event.target.value)}>
                <option value="all">Todos os tipos</option>
                {(facetsQuery.data?.types ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Seção responsável
              <select value={filters.section ?? 'all'} onChange={(event) => setFilter('section', event.target.value)}>
                <option value="all">Todas as seções</option>
                {(facetsQuery.data?.sections ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Período
              <select value={filters.period ?? '30d'} onChange={(event) => setFilter('period', event.target.value)}>
                <option value="30d">Últimos 30 dias</option>
                <option value="90d">Últimos 90 dias</option>
                <option value="2026-08">Agosto de 2026</option>
              </select>
            </label>
            <div className="ditel-filters__actions">
              <button className="button-link" type="button" onClick={clearAdvancedFilters}>
                Limpar filtros
              </button>
              <button
                className="button-link button-link--primary"
                type="button"
                onClick={() => {
                  void dashboardQuery.refetch()
                }}
              >
                Aplicar recorte
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <h2 className="dashboards-title">Dashboards estaduais</h2>
      {!hasQueryFeedback && data ? (
        <>
          <section className="ditel-primary-kpis" data-testid="ditel-primary-kpis" aria-label="Indicadores principais estaduais">
            {primaryMetrics.map((metric) => (
              <article key={metric.label} className={`ditel-metric ditel-metric--${metric.tone}`}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </section>

          <section className="ditel-secondary-indicators" data-testid="ditel-secondary-indicators" aria-label="Indicadores secundários estaduais">
            {secondaryMetrics.map((metric) => (
              <div key={metric.label} className={`ditel-secondary-indicator ditel-secondary-indicator--${metric.tone}`}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </section>

          {commandSummaries.length ? (
            <section className="module-panel ditel-command-comparison" aria-label="Comparação por comando">
              <div className="ditel-panel-heading">
                <div>
                  <span className="ditel-panel-kicker">Recorte hierárquico</span>
                  <h2>Comparação patrimonial por comando</h2>
                  <p>Equipamentos e atenção nos descendentes autorizados do recorte atual.</p>
                  <p>Indicador descritivo; não representa avaliação automática de desempenho.</p>
                </div>
                <span className="ditel-panel-caption">Indicador descritivo</span>
              </div>
              <div className="ditel-command-list" role="list" aria-label="Ranking de comandos por atenção">
                {sortedCommandSummaries.map((summary) => (
                  <div key={summary.command.id} className="ditel-command-row" role="listitem">
                    <div className="ditel-command-row__label">
                      <strong>{summary.command.name}</strong>
                      <span>{formatNumber(summary.attention)} de {formatNumber(summary.equipment)} equipamentos · {summary.attentionPercent}%</span>
                    </div>
                    <div className="ditel-command-row__track" aria-hidden="true">
                      <span style={{ width: barWidth(summary.attentionPercent, maxCommandAttention) }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="ditel-state-grid" aria-label="Visão estadual consolidada">
            <article className="module-panel ditel-state-health" data-testid="ditel-state-health">
              <div>
                <h2>Centro estadual DITEL</h2>
              </div>
              <div className="ditel-state-health__body">
                <div className="ditel-state-health__ring" style={{ '--health': `${healthPercent}%` } as CSSProperties}>
                  <span>Percentual em operação</span>
                  <strong>{healthPercent}%</strong>
                </div>
                <div className="ditel-state-health__readout">
                  <div>
                    <span>Operação estadual</span>
                    <strong>
                      {formatNumber(operationalIndicators.active)} / {formatNumber(operationalIndicators.total)}
                    </strong>
                  </div>
                  <div className="ditel-state-health__track">
                    <span style={{ width: `${healthPercent}%` }} />
                  </div>
                  <p>
                    {formatNumber(operationalIndicators.attention)} equipamento(s) em atenção no recorte atual.
                  </p>
                </div>
              </div>
              <div className="ditel-state-health__signals">
                <span>{formatNumber(data.criticalCalls ?? 0)} chamados críticos</span>
                <span>{formatNumber(data.pendingMovements ?? 0)} movimentações pendentes</span>
                <span>{formatNumber(monitoredUnits)} unidades monitoradas</span>
              </div>
            </article>

            <article className="module-panel ditel-park-distribution" data-testid="ditel-park-distribution">
              <div>
                <h2>Distribuição estadual do parque</h2>
              </div>
              <div className="ditel-park-distribution__stack" aria-hidden="true">
                {situations.map((item) => (
                  <span
                    key={item.situation}
                    className={`ditel-park-distribution__segment ditel-park-distribution__segment--${situationTone[item.situation] ?? 'operational'}`}
                    style={{ width: `${percent(item.count, total)}%` }}
                  />
                ))}
              </div>
              <ul className="ditel-park-distribution__list">
                {situations.map((item) => (
                  <li key={item.situation}>
                    <span>{item.label}</span>
                    <strong>
                      {formatNumber(item.count)} · {percent(item.count, total)}%
                    </strong>
                  </li>
                ))}
              </ul>
            </article>
          </section>

          <div className="ditel-dashboard-page__grid">
            <section className="module-panel ditel-units" aria-label="Unidades monitoradas">
              <div>
                <div className="ditel-panel-heading">
                  <div>
                    <span className="ditel-panel-kicker">Visão operacional</span>
                    <h2>Unidades monitoradas</h2>
                  </div>
                  <span className="ditel-panel-caption">{formatNumber(units.length)} unidades</span>
                </div>
              </div>
              <div className="ditel-units__table" role="table" aria-label="Resumo por unidade">
                <div role="row" className="ditel-units__header">
                  <span role="columnheader">Unidade</span>
                  <span role="columnheader">Participação no recorte</span>
                  <span role="columnheader">Equipamentos</span>
                  <span role="columnheader">Atenção</span>
                  <span role="columnheader">% em atenção</span>
                </div>
                {visibleUnits.map((unit) => (
                  <div key={unit.unit.id} role="row">
                    <strong role="cell">{unit.unit.name}</strong>
                    <span role="cell">{unit.equipmentShare ?? unit.coverage}</span>
                    <span role="cell">{formatNumber(unit.equipment)}</span>
                    <span role="cell">{formatNumber(unit.attention)}</span>
                    <span role="cell">{unit.attentionPercent ?? percent(unit.attention, unit.equipment)}%</span>
                  </div>
                ))}
              </div>
              {!units.length ? <p className="ditel-dashboard-empty">Nenhuma Unidade corresponde ao recorte atual.</p> : null}
              <div className="ditel-list-actions">
                {units.length > 5 ? (
                  <button className="button-link" type="button" onClick={() => setShowAllUnits((visible) => !visible)}>
                    {showAllUnits ? 'Mostrar menos unidades' : 'Ver todas as unidades'}
                  </button>
                ) : null}
                <Link className="button-link button-link--quiet" to={`/inventario${inventorySearch}`}>
                  Consultar inventário estadual
                </Link>
              </div>
            </section>
            <section className="module-panel ditel-ranking" data-testid="ditel-unit-ranking" aria-label="Ranking de atenção">
              <div className="ditel-panel-heading">
                <div>
                  <span className="ditel-panel-kicker">Prioridade relativa</span>
                  <h2>Ranking de atenção</h2>
                </div>
                <span className="ditel-panel-caption">Top 5</span>
              </div>
              <p className="ditel-panel-note">Indicador descritivo; não representa avaliação automática de desempenho.</p>
              {sortedUnits.length === 0 ? (
                <p className="ditel-dashboard-empty">Nenhuma Unidade corresponde ao recorte atual.</p>
              ) : (
                <ol className="ditel-ranking__list">
                  {visibleRanking.map((unit) => (
                    <li key={unit.unit.id}>
                      <div>
                        <strong>{unit.unit.name}</strong>
                        <span>{formatNumber(unit.attention)} de {formatNumber(unit.equipment)} · {unitAttentionPercent(unit)}%</span>
                      </div>
                      <div className="ditel-ranking__track">
                        <span style={{ width: barWidth(unitAttentionPercent(unit), 100) }} />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {sortedUnits.length > 5 ? (
                <button className="button-link" type="button" onClick={() => setShowAllRanking((visible) => !visible)}>
                  {showAllRanking ? 'Mostrar menos unidades' : 'Ver ranking completo'}
                </button>
              ) : null}
            </section>
          </div>

          <section className="ditel-analysis-grid" aria-label="Análise operacional estadual">
            <article className="module-panel ditel-calls-dashboard" data-testid="ditel-calls-dashboard">
              <div className="ditel-panel-heading">
                <div>
                  <h2>Chamados estaduais</h2>
                </div>
                <strong>{formatNumber(callsByStatus.reduce((sum, item) => sum + item.count, 0))} chamados</strong>
              </div>
              {callsByStatus.length === 0 ? (
                <p className="ditel-dashboard-empty">Nenhum chamado no escopo atual.</p>
              ) : (
                <ul className="ditel-bar-list">
                  {callsByStatus.map((item) => (
                    <li key={item.status}>
                      <div>
                        <span>{item.label}</span>
                        <strong>{formatNumber(item.count)}</strong>
                      </div>
                      <div className="ditel-bar-list__track">
                        <span style={{ width: barWidth(item.count, maxCallCount) }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="module-panel ditel-flow-dashboard">
              <div className="ditel-panel-heading">
                <div>
                  <h2>Fluxo patrimonial</h2>
                </div>
                <strong>{formatNumber(data.pendingMovements ?? 0)} pendentes</strong>
              </div>
              {recentMovements.length === 0 ? (
                <p className="ditel-dashboard-empty">Nenhuma movimentação recente.</p>
              ) : (
                <ol className="ditel-movement-list">
                  {recentMovements.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>Equipamento {item.equipmentId}</strong>
                        <span>
                          {item.origin.name} → {item.destination.name}
                        </span>
                      </div>
                      <span>
                        {item.status} · {new Date(item.occurredAt).toLocaleDateString('pt-BR')}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </article>

            <aside className="module-panel ditel-admin">
              <span>Administração patrimonial</span>
              <p>Gerencie usuários, unidades e perfis de acesso no escopo DITEL.</p>
              <Link className="button-link" to="/administracao">
                Abrir administração
              </Link>
            </aside>
          </section>

          <p className="ditel-dashboard-footnote">
            Unidades monitoradas: <strong>{formatNumber(monitoredUnits)}</strong>
          </p>
        </>
      ) : null}
    </section>
  )
}
