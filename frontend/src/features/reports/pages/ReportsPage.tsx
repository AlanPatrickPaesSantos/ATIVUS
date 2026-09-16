import { useRef, useState, type FormEvent } from 'react'
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { queryClient } from '../../../app/providers'
import type { SessionContext } from '../../../shared/auth/types'
import type { InventoryReportSituation } from '../../../shared/api/contracts'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'
import { getUnits } from '../../movements/api/unitsApi'
import { downloadInventoryReportExport, type InventoryReportExportFormat, type InventoryReportQuery } from '../api/reportsApi'
import { useCallsSummaryReportQuery, useGeneralReportQuery, useInventoryReportQuery, useMovementsSummaryReportQuery } from '../api/reportsQueries'

const situationOptions: Array<{ value: '' | InventoryReportSituation; label: string }> = [
  { value: '', label: 'Todas as situações' },
  { value: 'active', label: 'Ativo' },
  { value: 'maintenance', label: 'Em manutenção' },
  { value: 'inactive', label: 'Inativo' },
  { value: 'lost', label: 'Perdido' },
  { value: 'written_off', label: 'Baixado' },
]

const periodOptions: Array<{ value: string; label: string }> = [
  { value: '', label: 'Agosto de 2026' },
  { value: 'july_2026', label: 'Julho de 2026' },
  { value: 'q2_2026', label: '2º trimestre de 2026' },
]

type ReportKind = 'inventory' | 'calls' | 'movements' | 'general'

const reportKindOptions: Array<{ value: ReportKind; label: string }> = [
  { value: 'inventory', label: 'Inventário consolidado' },
  { value: 'calls', label: 'Chamados por status/prioridade' },
  { value: 'movements', label: 'Movimentações por período' },
  { value: 'general', label: 'Relatório geral DITEL' },
]

function equipmentLabel(total: number) {
  return `${total} ${total === 1 ? 'equipamento' : 'equipamentos'}`
}

const periodLabel = (period: string) => periodOptions.find((option) => option.value === period)?.label ?? 'Agosto de 2026'

function buildQuery(isDitel: boolean, selectedScope: string, situation: '' | InventoryReportSituation, period: string): InventoryReportQuery {
  return {
    ...(isDitel && selectedScope !== 'statewide' ? { unitId: selectedScope } : {}),
    ...(situation ? { situation } : {}),
    ...(period ? { period } : {}),
  }
}

export function ReportsPage({ session }: { session: SessionContext }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ReportsContent session={session} />
    </QueryClientProvider>
  )
}

function ReportsContent({ session }: { session: SessionContext }) {
  const isDitel = session.role === 'ditel_admin'
  const [reportKind, setReportKind] = useState<ReportKind>('inventory')
  const [draftKind, setDraftKind] = useState<ReportKind>('inventory')
  const [selectedScope, setSelectedScope] = useState('statewide')
  const [draftScope, setDraftScope] = useState('statewide')
  const [period, setPeriod] = useState(periodOptions[0].value)
  const periodRef = useRef(period)
  const [draftPeriod, setDraftPeriod] = useState(periodOptions[0].value)
  const [situation, setSituation] = useState<'' | InventoryReportSituation>('')
  const [draftSituation, setDraftSituation] = useState<'' | InventoryReportSituation>('')
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportingFormat, setExportingFormat] = useState<InventoryReportExportFormat | null>(null)

  const reportQuery = buildQuery(isDitel, selectedScope, situation, period)
  const inventoryQuery = useInventoryReportQuery(reportQuery)
  const callsQuery = useCallsSummaryReportQuery(reportQuery)
  const movementsQuery = useMovementsSummaryReportQuery(reportQuery)
  const generalQuery = useGeneralReportQuery(reportQuery)
  const currentQuery = reportKind === 'calls' ? callsQuery : reportKind === 'movements' ? movementsQuery : reportKind === 'general' ? generalQuery : inventoryQuery
  const unitsQuery = useQuery({
    queryKey: ['reports', 'units'],
    queryFn: getUnits,
    enabled: isDitel,
  })

  const report = currentQuery.data?.report
  const scopeLabel = report?.scope.name ?? session.unit?.name ?? 'Todo o estado'
  const selectedSituationLabel = situationOptions.find((option) => option.value === situation)?.label ?? 'Todas as situações'
  const canExport = reportKind === 'inventory' && Boolean(inventoryQuery.data) && !inventoryQuery.isFetching && !exportingFormat

  function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setReportKind(draftKind)
    setSelectedScope(draftScope)
    setSituation(draftSituation)
    setPeriod(draftPeriod)
    periodRef.current = draftPeriod
    setExportStatus(null)
    setExportError(null)
  }

  async function exportReport(format: InventoryReportExportFormat) {
    if (!inventoryQuery.data) return

    setExportingFormat(format)
    setExportStatus(null)
    setExportError(null)

    try {
      const blob = await downloadInventoryReportExport({ ...buildQuery(isDitel, selectedScope, situation, periodRef.current), format })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `inventory-summary.${format}`
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setExportStatus(`Exportação ${format.toUpperCase()} preparada.`)
    } catch {
      setExportError(`Não foi possível preparar a exportação ${format.toUpperCase()}.`)
    } finally {
      setExportingFormat(null)
    }
  }

  return <section className="module-page reports-page" data-testid="reports-operation-workspace" data-visual-variant="operational-report-workspace" aria-labelledby="reports-title">
    <header className="module-page__header">
      <div>
        <p className="page-eyebrow">{isDitel ? 'Gestão estadual · DITEL' : `Gestão patrimonial · ${session.unit?.name ?? 'Unidade'}`}</p>
        <h1 id="reports-title">Relatórios patrimoniais</h1>
        <p>Defina o recorte autorizado, revise a composição e prepare o arquivo para exportação.</p>
      </div>
    </header>
    <div className="reports-page__grid">
      <form className="module-panel report-controls" onSubmit={submitPreview}>
        <div>
          <p className="page-eyebrow">Configuração</p>
          <h2>Seleção do relatório</h2>
          <p>Defina o recorte antes de atualizar a prévia para conferência.</p>
        </div>
        <label>Modelo<select aria-label="Modelo de relatório" value={draftKind} onChange={(event) => { setDraftKind(event.target.value as ReportKind); setExportStatus(null); setExportError(null) }}>
          {reportKindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        {reportKind !== 'calls' && reportKind !== 'movements' ? <>
          <label>Situação<select aria-label="Situação" value={draftSituation} onChange={(event) => { setDraftSituation(event.target.value as '' | InventoryReportSituation); setExportStatus(null); setExportError(null) }}>
            {situationOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
          </select></label>
          <label>Período<select aria-label="Período" value={draftPeriod} onChange={(event) => { setDraftPeriod(event.target.value); setExportStatus(null); setExportError(null) }}>
            {periodOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
          </select></label>
        </> : <label>Período<select aria-label="Período" value={draftPeriod} onChange={(event) => { setDraftPeriod(event.target.value); setExportStatus(null); setExportError(null) }}>
          {periodOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
        </select></label>}
        {isDitel
          ? <label>Escopo<select aria-label="Escopo" value={draftScope} onChange={(event) => { setDraftScope(event.target.value); setExportStatus(null); setExportError(null) }}>
              <option value="statewide">Todo o estado</option>
              {(unitsQuery.data?.items ?? []).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select></label>
          : <p className="report-scope-lock"><strong>Escopo fixo</strong><span>{session.unit?.name ?? 'Unidade autenticada'}</span></p>}
        <button type="submit" className="button-link">Atualizar prévia</button>
        {reportKind === 'inventory' && <button type="button" className="button-link" disabled={!canExport} onClick={() => { void exportReport('csv') }}>Exportar CSV</button>}
        {reportKind === 'inventory' && <button type="button" className="button-link button-link--primary" disabled={!canExport} onClick={() => { void exportReport('pdf') }}>Exportar PDF</button>}
        {exportingFormat && <p className="module-export-status" role="status">Preparando exportação {exportingFormat.toUpperCase()}...</p>}
        {exportStatus && <p className="module-export-status" role="status">{exportStatus}</p>}
        {exportError && <p className="module-export-status" role="alert">{exportError}</p>}
      </form>
      <article className="module-panel report-preview" aria-labelledby="report-preview-title">
        {currentQuery.isLoading ? <LoadingState label="Carregando relatório" /> : null}
        {currentQuery.isError ? <ErrorState message="Não foi possível carregar o relatório." onRetry={() => { void currentQuery.refetch() }} /> : null}
        {reportKind === 'inventory' && inventoryQuery.data ? <InventoryPreview response={inventoryQuery.data} periodLabel={periodLabel(period)} scopeLabel={scopeLabel} selectedSituationLabel={selectedSituationLabel} /> : null}
        {reportKind === 'calls' && callsQuery.data ? <CallsPreview response={callsQuery.data} scopeLabel={scopeLabel} /> : null}
        {reportKind === 'movements' && movementsQuery.data ? <MovementsPreview response={movementsQuery.data} scopeLabel={scopeLabel} /> : null}
        {reportKind === 'general' && generalQuery.data ? <GeneralPreview response={generalQuery.data} scopeLabel={scopeLabel} selectedSituationLabel={selectedSituationLabel} /> : null}
      </article>
    </div>
  </section>
}

function PreviewMasthead({ generatedByName }: { generatedByName: string }) {
  return <header className="report-preview__masthead"><img src="/images/brasao-pmpa.png" alt="Brasão da Polícia Militar do Pará" /><div><p className="page-eyebrow">SIGAT · PMPA / DITEL</p><span>Documento para conferência</span></div><strong>{generatedByName}</strong></header>
}

function InventoryPreview({ response, periodLabel: label, scopeLabel, selectedSituationLabel }: { response: import('../../../shared/api/contracts').InventoryReportResponse; periodLabel: string; scopeLabel: string; selectedSituationLabel: string }) {
  return <div className="report-preview__paper" data-ready="true">
    <PreviewMasthead generatedByName={response.generatedBy.name} />
    <h2 id="report-preview-title">Pré-visualização</h2>
    <h3>{response.report.title}</h3><p>Posição patrimonial por unidade e situação.</p>
    <dl><div><dt>Período</dt><dd>{label}</dd></div><div><dt>Escopo</dt><dd>{scopeLabel}</dd></div><div><dt>Registros incluídos</dt><dd>{equipmentLabel(response.totals.total)}</dd></div><div><dt>Gerado por</dt><dd>{response.generatedBy.name}</dd></div></dl>
    <section className="report-preview__filters"><strong>Filtros aplicados</strong><span>Situação: {selectedSituationLabel}</span></section>
    <section className="report-preview__counters">
      <strong>{response.totals.active} em operação</strong>
      <span>{response.totals.maintenance} em manutenção</span>
      <span>{response.totals.attention} requerem atenção</span>
    </section>
    <footer className="report-preview__footer"><span>Prévia atualizada para conferência.</span><span>Emissão: {new Date(response.report.generatedAt).toLocaleDateString('pt-BR')}</span></footer>
  </div>
}

function CallsPreview({ response, scopeLabel }: { response: import('../../../shared/api/contracts').CallsSummaryReportResponse; scopeLabel: string }) {
  return <div className="report-preview__paper" data-ready="true">
    <PreviewMasthead generatedByName={response.generatedBy.name} />
    <h2 id="report-preview-title">Pré-visualização</h2>
    <h3>{response.report.title}</h3><p>Distribuição de chamados por status e prioridade.</p>
    <dl><div><dt>Escopo</dt><dd>{scopeLabel}</dd></div><div><dt>Chamados no período</dt><dd>{response.totals.total}</dd></div><div><dt>Críticos</dt><dd>{response.totals.critical}</dd></div><div><dt>Abertos</dt><dd>{response.totals.open}</dd></div><div><dt>Em atenção</dt><dd>{response.totals.attention}</dd></div><div><dt>Resolvidos</dt><dd>{response.totals.resolved}</dd></div></dl>
    <section className="report-preview__filters"><strong>Por status</strong>{response.byStatus.length ? response.byStatus.map((item) => <span key={item.status}>{item.status}: {item.count}</span>) : <span>Sem registros</span>}</section>
    <section className="report-preview__filters"><strong>Por prioridade</strong>{response.byPriority.length ? response.byPriority.map((item) => <span key={item.priority}>{item.priority}: {item.count}</span>) : <span>Sem registros</span>}</section>
    <footer className="report-preview__footer"><span>Prévia atualizada para conferência.</span><span>Emissão: {new Date(response.report.generatedAt).toLocaleDateString('pt-BR')}</span></footer>
  </div>
}

function MovementsPreview({ response, scopeLabel }: { response: import('../../../shared/api/contracts').MovementsSummaryReportResponse; scopeLabel: string }) {
  return <div className="report-preview__paper" data-ready="true">
    <PreviewMasthead generatedByName={response.generatedBy.name} />
    <h2 id="report-preview-title">Pré-visualização</h2>
    <h3>{response.report.title}</h3><p>Movimentações de equipamentos envolvendo a unidade no período.</p>
    <dl><div><dt>Escopo</dt><dd>{scopeLabel}</dd></div><div><dt>Movimentações</dt><dd>{response.totals.total}</dd></div><div><dt>Pendentes</dt><dd>{response.totals.pending}</dd></div><div><dt>Aprovadas</dt><dd>{response.totals.approved}</dd></div><div><dt>Rejeitadas</dt><dd>{response.totals.rejected}</dd></div></dl>
    <section className="report-preview__filters"><strong>Por situação</strong>{response.byStatus.length ? response.byStatus.map((item) => <span key={item.status}>{item.status}: {item.count}</span>) : <span>Sem registros</span>}</section>
    <footer className="report-preview__footer"><span>Prévia atualizada para conferência.</span><span>Emissão: {new Date(response.report.generatedAt).toLocaleDateString('pt-BR')}</span></footer>
  </div>
}

function GeneralPreview({ response, scopeLabel, selectedSituationLabel }: { response: import('../../../shared/api/contracts').GeneralReportResponse; scopeLabel: string; selectedSituationLabel: string }) {
  return <div className="report-preview__paper" data-ready="true">
    <PreviewMasthead generatedByName={response.generatedBy.name} />
    <h2 id="report-preview-title">Pré-visualização</h2>
    <h3>{response.report.title}</h3><p>Consolidação de inventário, chamados e movimentações no escopo autenticado.</p>
    <dl><div><dt>Escopo</dt><dd>{scopeLabel}</dd></div><div><dt>Situação</dt><dd>{selectedSituationLabel}</dd></div></dl>
    <section className="report-preview__counters">
      <strong>{response.inventory.totals.active} em operação</strong>
      <span>{response.inventory.totals.maintenance} em manutenção</span>
      <span>{response.inventory.totals.attention} requerem atenção</span>
    </section>
    <section className="report-preview__filters"><strong>Chamados</strong><span>{response.calls.totals.total} no período</span><span>{response.calls.totals.critical} críticos</span><span>{response.calls.totals.open} abertos</span></section>
    <section className="report-preview__filters"><strong>Movimentações</strong><span>{response.movements.totals.total} no período</span><span>{response.movements.totals.pending} pendentes</span></section>
    <footer className="report-preview__footer"><span>Prévia atualizada para conferência.</span><span>Emissão: {new Date(response.report.generatedAt).toLocaleDateString('pt-BR')}</span></footer>
  </div>
}