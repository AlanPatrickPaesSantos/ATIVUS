import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDashboardQuery } from '../api/dashboardQueries'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'

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
  const units = useMemo(() => (dashboardQuery.data?.unitSummaries ?? []).filter((summary) => {
    return (unitId === 'statewide' || summary.unit.id === unitId) && (situation === 'all' || summary.attention > 0)
  }), [dashboardQuery.data?.unitSummaries, situation, unitId])
  const metrics = dashboardQuery.data ? [
    { label: 'Equipamentos cadastrados', value: String(dashboardQuery.data.metrics.total), tone: 'operational' as const },
    { label: 'Equipamentos em manutenção', value: String(dashboardQuery.data.metrics.maintenance), tone: 'attention' as const },
    { label: 'Requer atenção', value: String(dashboardQuery.data.metrics.attention), tone: 'critical' as const },
    { label: 'Chamados críticos', value: '0', tone: 'critical' as const },
    { label: 'Movimentações pendentes', value: '0', tone: 'operational' as const },
  ] : []
  const activeFilters = [municipality !== 'all' ? municipality : '', region !== 'all' ? region : '', equipmentType !== 'all' ? equipmentType : '', section !== 'all' ? section : '', period].filter(Boolean)
  const hasAdvancedFilters = municipality !== 'all' || region !== 'all' || equipmentType !== 'all' || section !== 'all' || period !== 'Últimos 30 dias'
  const hasQueryFeedback = dashboardQuery.isLoading || dashboardQuery.isError
  const unitOptions = dashboardQuery.data?.unitSummaries ?? []

  function clearAdvancedFilters() { setMunicipality('all'); setRegion('all'); setEquipmentType('all'); setSection('all'); setPeriod('Últimos 30 dias') }

  return <section className="module-page ditel-dashboard-page" data-testid="ditel-operations-console" data-visual-variant="statewide-operations-console" aria-labelledby="ditel-dashboard-title">
    <header className="module-page__header"><div><p className="page-eyebrow">Gestão estadual · DITEL</p><h1 id="ditel-dashboard-title">Painel estadual DITEL</h1><p>Leitura consolidada da cobertura patrimonial, das unidades e dos pontos que exigem decisão administrativa.</p></div><Link className="button-link button-link--primary" to="/relatorios">Gerar relatório</Link></header>
    {dashboardQuery.isLoading ? <LoadingState label="Carregando painel estadual" /> : null}
    {dashboardQuery.isError ? <ErrorState message="Não foi possível carregar o painel estadual." onRetry={() => { void dashboardQuery.refetch() }} /> : null}
    <section className="module-panel ditel-filters" aria-label="Filtros estaduais"><div className="ditel-filters__primary"><label>Unidade monitorada<select value={unitId} onChange={(event) => setUnitId(event.target.value)}><option value="statewide">Todas as unidades</option>{unitOptions.map((item) => <option key={item.unit.id} value={item.unit.id}>{item.unit.name}</option>)}</select></label><label>Situação do parque<select value={situation} onChange={(event) => setSituation(event.target.value)}><option value="all">Todas as situações</option><option value="attention">Com atenção</option></select></label><button className="button-link" type="button" aria-expanded={isAdvancedFiltersOpen} aria-controls="ditel-advanced-filters" onClick={() => setIsAdvancedFiltersOpen((open) => !open)}>Filtros avançados</button></div>{isAdvancedFiltersOpen && <div id="ditel-advanced-filters" className="ditel-filters__advanced"><label>Município<select value={municipality} onChange={(event) => setMunicipality(event.target.value)}><option value="all">Todos os municípios</option></select></label><label>Região<select value={region} onChange={(event) => setRegion(event.target.value)}><option value="all">Todas as regiões</option></select></label><label>Tipo de equipamento<select value={equipmentType} onChange={(event) => setEquipmentType(event.target.value)}><option value="all">Todos os tipos</option></select></label><label>Seção responsável<select value={section} onChange={(event) => setSection(event.target.value)}><option value="all">Todas as seções</option></select></label><label>Período<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="Últimos 30 dias">Últimos 30 dias</option><option value="Últimos 90 dias">Últimos 90 dias</option><option value="Agosto de 2026">Agosto de 2026</option></select></label><div className="ditel-filters__actions"><button className="button-link" type="button" onClick={clearAdvancedFilters}>Limpar filtros</button><button className="button-link button-link--primary" type="button" onClick={() => setIsAdvancedFiltersOpen(false)}>Aplicar filtros</button></div></div>}</section>
    <div className="ditel-filter-summary"><span>{municipality !== 'all' ? `Recorte ativo: ${municipality}` : 'Recorte ativo: estadual'}</span>{hasAdvancedFilters && <button type="button" onClick={clearAdvancedFilters}>Limpar recorte avançado</button>}<small>{activeFilters.join(' · ')}</small></div>
    {!hasQueryFeedback && dashboardQuery.data ? <><section className="ditel-metric-grid" aria-label="Indicadores estaduais">{metrics.map((metric) => <article key={metric.label} className={`ditel-metric ditel-metric--${metric.tone}`}><span>{metric.label}</span><strong>{metric.value}</strong></article>)}</section>
    <section className="ditel-action-grid" aria-label="Pendências estaduais"><article className="module-panel ditel-action-card"><h2>Chamados críticos</h2><strong>0 chamados</strong><p>Demandas críticas no recorte selecionado.</p><Link className="button-link" to="/chamados">Revisar chamados</Link></article><article className="module-panel ditel-action-card"><h2>Movimentações pendentes</h2><strong>0 movimentações</strong><p>Eventos que aguardam conferência patrimonial.</p><Link className="button-link" to="/movimentacoes">Revisar movimentações</Link></article></section>
    <div className="ditel-dashboard-page__grid"><section className="module-panel ditel-units"><div><h2>Unidades monitoradas</h2><p>Cobertura do inventário e demandas prioritárias por unidade.</p></div><div className="ditel-units__table" role="table" aria-label="Resumo por unidade"><div role="row" className="ditel-units__header"><span role="columnheader">Unidade</span><span role="columnheader">Cobertura</span><span role="columnheader">Equipamentos</span><span role="columnheader">Atenção</span></div>{units.map((unit) => <div key={unit.unit.id} role="row"><strong role="cell">{unit.unit.name}</strong><span role="cell">{unit.coverage}</span><span role="cell">{unit.equipment}</span><span role="cell">{unit.attention}</span></div>)}</div>{!units.length && <p className="ditel-dashboard-empty">Nenhuma Unidade corresponde ao recorte atual.</p>}<Link className="button-link" to="/inventario">Consultar inventário estadual</Link></section><aside className="module-panel ditel-equipment"><div><h2>Situação do parque</h2><p>Consolidado dos registros sincronizados.</p></div><ul>{dashboardQuery.data.situations.map((item) => <li key={item.situation}><span>{item.label}</span><strong>{item.count}</strong></li>)}</ul><section className="ditel-admin"><span>Administração patrimonial</span><p>Gerencie usuários, unidades e perfis de acesso no escopo DITEL.</p><Link className="button-link" to="/administracao">Abrir administração</Link></section></aside></div></> : null}
  </section>
}
