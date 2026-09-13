import { useRef, useState, type FormEvent } from 'react'
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { queryClient } from '../../../app/providers'
import type { SessionContext } from '../../../shared/auth/types'
import type { InventoryReportSituation } from '../../../shared/api/contracts'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'
import { getUnits } from '../../movements/api/unitsApi'
import { downloadInventoryReportExport, type InventoryReportExportFormat, type InventoryReportQuery } from '../api/reportsApi'
import { useInventoryReportQuery } from '../api/reportsQueries'

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

function equipmentLabel(total: number) {
  return `${total} ${total === 1 ? 'equipamento' : 'equipamentos'}`
}

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
  const reportQuery = useInventoryReportQuery(buildQuery(isDitel, selectedScope, situation, period))
  const unitsQuery = useQuery({
    queryKey: ['reports', 'units'],
    queryFn: getUnits,
    enabled: isDitel,
  })

  const report = reportQuery.data
  const scopeLabel = report?.report.scope.name ?? session.unit?.name ?? 'Todo o estado'
  const selectedSituationLabel = situationOptions.find((option) => option.value === situation)?.label ?? 'Todas as situações'
  const canExport = Boolean(report) && !reportQuery.isFetching && !exportingFormat

  function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSelectedScope(draftScope)
    setSituation(draftSituation)
    setPeriod(draftPeriod)
    periodRef.current = draftPeriod
    setExportStatus(null)
    setExportError(null)
  }

async function exportReport(format: InventoryReportExportFormat) {
    if (!report) return

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
        <label>Modelo<select aria-label="Modelo de relatório" value="inventario" onChange={() => undefined}>
          <option value="inventario">Inventário consolidado</option>
        </select></label>
        <label>Situação<select aria-label="Situação" value={draftSituation} onChange={(event) => { setDraftSituation(event.target.value as '' | InventoryReportSituation); setExportStatus(null); setExportError(null) }}>
          {situationOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
        </select></label>
        <label>Período<select aria-label="Período" value={draftPeriod} onChange={(event) => { setDraftPeriod(event.target.value); setExportStatus(null); setExportError(null) }}>
          {periodOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
        </select></label>
        {isDitel
          ? <label>Escopo<select aria-label="Escopo" value={draftScope} onChange={(event) => { setDraftScope(event.target.value); setExportStatus(null); setExportError(null) }}>
              <option value="statewide">Todo o estado</option>
              {(unitsQuery.data?.items ?? []).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select></label>
          : <p className="report-scope-lock"><strong>Escopo fixo</strong><span>{session.unit?.name ?? 'Unidade autenticada'}</span></p>}
        <button type="submit" className="button-link">Atualizar prévia</button>
        <button type="button" className="button-link" disabled={!canExport} onClick={() => { void exportReport('csv') }}>Exportar CSV</button>
        <button type="button" className="button-link button-link--primary" disabled={!canExport} onClick={() => { void exportReport('pdf') }}>Exportar PDF</button>
        {exportingFormat && <p className="module-export-status" role="status">Preparando exportação {exportingFormat.toUpperCase()}...</p>}
        {exportStatus && <p className="module-export-status" role="status">{exportStatus}</p>}
        {exportError && <p className="module-export-status" role="alert">{exportError}</p>}
      </form>
      <article className="module-panel report-preview" aria-labelledby="report-preview-title">
        {reportQuery.isLoading ? <LoadingState label="Carregando relatório" /> : null}
        {reportQuery.isError ? <ErrorState message="Não foi possível carregar o relatório." onRetry={() => { void reportQuery.refetch() }} /> : null}
        {report ? <div className="report-preview__paper" data-ready="true">
          <header className="report-preview__masthead"><img src="/images/brasao-pmpa.png" alt="Brasão da Polícia Militar do Pará" /><div><p className="page-eyebrow">SIGAT · PMPA / DITEL</p><span>Documento para conferência</span></div><strong>PDF</strong></header><h2 id="report-preview-title">Pré-visualização</h2>
          <h3>{report.report.title}</h3><p>Posição patrimonial por unidade e situação.</p>
          <dl><div><dt>Período</dt><dd>{periodOptions.find((option) => option.value === period)?.label ?? 'Agosto de 2026'}</dd></div><div><dt>Escopo</dt><dd>{scopeLabel}</dd></div><div><dt>Registros incluídos</dt><dd>{equipmentLabel(report.totals.total)}</dd></div><div><dt>Gerado por</dt><dd>{report.generatedBy.name}</dd></div></dl>
          <section className="report-preview__filters"><strong>Filtros aplicados</strong><span>Situação: {selectedSituationLabel}</span></section>
          <section className="report-preview__filters" aria-label="Resumo do inventário">
            <strong>{report.totals.active} em operação</strong>
            <span>{report.totals.maintenance} em manutenção</span>
            <span>{report.totals.attention} requerem atenção</span>
          </section>
          <footer className="report-preview__footer"><span>Prévia atualizada para conferência.</span><span>Emissão: {new Date(report.report.generatedAt).toLocaleDateString('pt-BR')}</span></footer>
        </div> : null}
      </article>
    </div>
  </section>
}
