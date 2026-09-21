import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
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
  equipment: number
  attention: number
}

type CallsByStatus = {
  status: string
  label: string
  count: number
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

function parseCoverage(value: string) {
  const parsed = Number(value.replace('%', '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function barWidth(value: number, max: number) {
  if (max <= 0) return '0%'
  return `${Math.max(6, Math.round((value / max) * 100))}%`
}

export function DitelDashboardPage() {
  const [unitId, setUnitId] = useState('statewide')
  const [situation, setSituation] = useState('all')
  const [municipality, setMunicipality] = useState('all')
  const [region, setRegion] = useState('all')
  const [equipmentType, setEquipmentType] = useState('all')
  const [section, setSection] = useState('all')
  const [period, setPeriod] = useState('Últimos 30 dias')
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false)
  const dashboardQuery = useDashboardQuery()
  const data = dashboardQuery.data

  const units = useMemo(() => {
    return ((data?.unitSummaries ?? []) as UnitSummary[]).filter((summary) => {
      return (unitId === 'statewide' || summary.unit.id === unitId) && (situation === 'all' || summary.attention > 0)
    })
  }, [data?.unitSummaries, situation, unitId])

  const sortedUnits = useMemo(() => {
    return [...units].sort((a, b) => b.attention - a.attention || b.equipment - a.equipment)
  }, [units])

  const callsByStatus = (data?.callsByStatus ?? []) as CallsByStatus[]
  const recentMovements = (data?.recentMovements ?? []) as RecentMovement[]
  const situations = (data?.situations ?? []) as Situation[]
  const monitoredUnits = data?.monitoredUnits ?? 0
  const total = data?.metrics.total ?? 0
  const active = data?.metrics.active ?? 0
  const maintenance = data?.metrics.maintenance ?? 0
  const inactive = situations.find((item) => item.situation === 'inactive')?.count ?? 0
  const attention = data?.metrics.attention ?? 0
  const healthPercent = percent(active, total)
  const maxCallCount = Math.max(...callsByStatus.map((item) => item.count), 0)
  const maxUnitAttention = Math.max(...sortedUnits.map((item) => item.attention), 0)
  const hasQueryFeedback = dashboardQuery.isLoading || dashboardQuery.isError
  const unitOptions = (data?.unitSummaries ?? []) as UnitSummary[]

  const metrics = data
    ? [
        { label: 'Equipamentos cadastrados', value: formatNumber(total), tone: 'operational' as Tone },
        { label: 'Em operação', value: formatNumber(active), tone: 'available' as Tone },
        { label: 'Em manutenção', value: formatNumber(maintenance), tone: 'attention' as Tone },
        { label: 'Inativos', value: formatNumber(inactive), tone: 'critical' as Tone },
        { label: 'Chamados críticos', value: formatNumber(data.criticalCalls ?? 0), tone: 'critical' as Tone },
        { label: 'Movimentações pendentes', value: formatNumber(data.pendingMovements ?? 0), tone: 'operational' as Tone },
      ]
    : []

  function clearAdvancedFilters() {
    setMunicipality('all')
    setRegion('all')
    setEquipmentType('all')
    setSection('all')
    setPeriod('Últimos 30 dias')
  }

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
            Unidade monitorada
            <select value={unitId} onChange={(event) => setUnitId(event.target.value)}>
              <option value="statewide">Todas as unidades</option>
              {unitOptions.map((item) => (
                <option key={item.unit.id} value={item.unit.id}>
                  {item.unit.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Situação do parque
            <select value={situation} onChange={(event) => setSituation(event.target.value)}>
              <option value="all">Todas as situações</option>
              <option value="attention">Com atenção</option>
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
              <select value={municipality} onChange={(event) => setMunicipality(event.target.value)}>
                <option value="all">Todos os municípios</option>
              </select>
            </label>
            <label>
              Região
              <select value={region} onChange={(event) => setRegion(event.target.value)}>
                <option value="all">Todas as regiões</option>
              </select>
            </label>
            <label>
              Tipo de equipamento
              <select value={equipmentType} onChange={(event) => setEquipmentType(event.target.value)}>
                <option value="all">Todos os tipos</option>
              </select>
            </label>
            <label>
              Seção responsável
              <select value={section} onChange={(event) => setSection(event.target.value)}>
                <option value="all">Todas as seções</option>
              </select>
            </label>
            <label>
              Período
              <select value={period} onChange={(event) => setPeriod(event.target.value)}>
                <option value="Últimos 30 dias">Últimos 30 dias</option>
                <option value="Últimos 90 dias">Últimos 90 dias</option>
                <option value="Agosto de 2026">Agosto de 2026</option>
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
          <section className="ditel-metric-grid" aria-label="Indicadores estaduais">
            {metrics.map((metric) => (
              <article key={metric.label} className={`ditel-metric ditel-metric--${metric.tone}`}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </section>

          <section className="ditel-state-grid" aria-label="Visão estadual consolidada">
            <article className="module-panel ditel-state-health" data-testid="ditel-state-health">
              <div>
                <h2>Centro estadual DITEL</h2>
              </div>
              <div className="ditel-state-health__body">
                <div className="ditel-state-health__ring" style={{ '--health': `${healthPercent}%` } as CSSProperties}>
                  <span>Saúde estadual</span>
                  <strong>{healthPercent}%</strong>
                </div>
                <div className="ditel-state-health__readout">
                  <div>
                    <span>Operação estadual</span>
                    <strong>
                      {formatNumber(active)} / {formatNumber(total)}
                    </strong>
                  </div>
                  <div className="ditel-state-health__track">
                    <span style={{ width: `${healthPercent}%` }} />
                  </div>
                  <p>
                    {formatNumber(maintenance + attention)} equipamento(s) exigem acompanhamento no recorte atual.
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
            <section className="module-panel ditel-units">
              <div>
                <h2>Unidades monitoradas</h2>
              </div>
              <div className="ditel-units__table" role="table" aria-label="Resumo por unidade">
                <div role="row" className="ditel-units__header">
                  <span role="columnheader">Unidade</span>
                  <span role="columnheader">Cobertura</span>
                  <span role="columnheader">Equipamentos</span>
                  <span role="columnheader">Atenção</span>
                </div>
                {units.map((unit) => (
                  <div key={unit.unit.id} role="row">
                    <strong role="cell">{unit.unit.name}</strong>
                    <span role="cell">{unit.coverage}</span>
                    <span role="cell">{formatNumber(unit.equipment)}</span>
                    <span role="cell">{formatNumber(unit.attention)}</span>
                  </div>
                ))}
              </div>
              {!units.length ? <p className="ditel-dashboard-empty">Nenhuma Unidade corresponde ao recorte atual.</p> : null}
              <Link className="button-link" to="/inventario">
                Consultar inventário estadual
              </Link>
            </section>

            <section className="module-panel ditel-coverage-dashboard">
              <div>
                <h2>Cobertura por unidade</h2>
              </div>
              <ol className="ditel-coverage-dashboard__list">
                {sortedUnits.map((unit) => (
                  <li key={unit.unit.id}>
                    <div>
                      <strong>{unit.unit.name}</strong>
                      <span>{unit.coverage}</span>
                    </div>
                    <div className="ditel-coverage-dashboard__track">
                      <span style={{ width: `${parseCoverage(unit.coverage)}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
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

            <article className="module-panel ditel-ranking" data-testid="ditel-unit-ranking">
              <div>
                <h2>Ranking de atenção</h2>
              </div>
              {sortedUnits.length === 0 ? (
                <p className="ditel-dashboard-empty">Nenhuma Unidade corresponde ao recorte atual.</p>
              ) : (
                <ol className="ditel-ranking__list">
                  {sortedUnits.slice(0, 5).map((unit) => (
                    <li key={unit.unit.id}>
                      <div>
                        <strong>{unit.unit.name}</strong>
                        <span>{formatNumber(unit.attention)} pendências</span>
                      </div>
                      <div className="ditel-ranking__track">
                        <span style={{ width: barWidth(unit.attention, maxUnitAttention) }} />
                      </div>
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
