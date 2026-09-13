import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SessionContext } from '../../../shared/auth/types'
import { setSession, clearSession } from '../../../shared/auth/session'
import { server } from '../../../shared/api/msw/server'
import { queryClient } from '../../../app/providers'
import { ReportsPage } from './ReportsPage'

const unitSession: SessionContext = { userId: 'unit-001', name: 'Ana Souza', registration: '100001', role: 'unit_user', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'UC' } }
const ditelSession: SessionContext = { userId: 'ditel-001', name: 'Carlos Lima', registration: '200001', role: 'ditel_admin', unit: null }

const reportResponse = {
  report: {
    id: 'inventory-summary',
    title: 'Inventário consolidado',
    generatedAt: '2026-09-10T12:00:00.000Z',
    scope: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'UC' },
    filters: { situation: null },
  },
  totals: {
    total: 2,
    active: 1,
    maintenance: 1,
    inactive: 0,
    lost: 0,
    writtenOff: 0,
    attention: 0,
  },
  units: [
    {
      unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'UC' },
      total: 2,
      active: 1,
      maintenance: 1,
      inactive: 0,
      lost: 0,
      writtenOff: 0,
      attention: 0,
    },
  ],
  generatedBy: { name: 'Ana Souza', role: 'unit_user' },
}

function renderReports(session = unitSession) {
  setSession(session)
  return render(<ReportsPage session={session} />)
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

beforeEach(() => {
  queryClient.clear()
})

afterEach(() => {
  clearSession()
  queryClient.clear()
  vi.restoreAllMocks()
  server.resetHandlers()
})

afterAll(() => {
  clearSession()
  queryClient.clear()
  server.close()
})

test('loads the authenticated inventory report preview from the API instead of fixture totals', async () => {
  const requestedUrls: string[] = []
  server.use(http.get('*/api/v1/reports/inventory-summary', ({ request }) => {
    requestedUrls.push(request.url)
    return HttpResponse.json(reportResponse)
  }))

  renderReports()

  expect(screen.getByRole('status')).toHaveTextContent('Carregando relatório')
  expect(await screen.findByText('2 equipamentos')).toBeInTheDocument()
  expect(screen.getAllByText('Unidade Centro').length).toBeGreaterThan(0)
  expect(screen.getByText('1 em operação')).toBeInTheDocument()
  expect(screen.queryByText('428 equipamentos')).not.toBeInTheDocument()
  expect(requestedUrls).toHaveLength(1)
  expect(new URL(requestedUrls[0]).searchParams.get('unitId')).toBeNull()
})

test('keeps Unit users locked to their authenticated scope even if only DITEL can select statewide scopes', async () => {
  server.use(http.get('*/api/v1/reports/inventory-summary', () => HttpResponse.json(reportResponse)))

  renderReports(unitSession)

  expect(screen.getByText('Escopo fixo').parentElement).toHaveTextContent('Unidade Centro')
  expect(screen.queryByRole('combobox', { name: 'Escopo' })).not.toBeInTheDocument()
  expect(await screen.findByText('2 equipamentos')).toBeInTheDocument()
})

test('lets DITEL choose a unit scope and reloads the report with the selected unitId', async () => {
  const user = userEvent.setup()
  const requestedUnitIds: (string | null)[] = []
  server.use(http.get('*/api/v1/reports/inventory-summary', ({ request }) => {
    requestedUnitIds.push(new URL(request.url).searchParams.get('unitId'))
    return HttpResponse.json({
      ...reportResponse,
      report: { ...reportResponse.report, scope: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' } },
      totals: { ...reportResponse.totals, total: 1, active: 1, maintenance: 0 },
      units: [{ ...reportResponse.units[0], unit: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' }, total: 1, active: 1, maintenance: 0 }],
    })
  }))

  renderReports(ditelSession)

  expect(await screen.findByRole('option', { name: 'Unidade Norte' })).toBeInTheDocument()
  await user.selectOptions(screen.getByRole('combobox', { name: 'Escopo' }), 'unit-norte')
  await user.click(screen.getByRole('button', { name: 'Atualizar prévia' }))

  await waitFor(() => expect(requestedUnitIds).toContain('unit-norte'))
  expect((await screen.findAllByText('Unidade Norte')).length).toBeGreaterThan(0)
})

test('shows a retryable error without stale report data when the report request fails', async () => {
  const user = userEvent.setup()
  let shouldFail = true
  server.use(http.get('*/api/v1/reports/inventory-summary', () => {
    if (shouldFail) return HttpResponse.json({ code: 'REPORT_UNAVAILABLE', message: 'Falha ao gerar relatório.' }, { status: 500 })
    return HttpResponse.json(reportResponse)
  }))

  renderReports()

  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o relatório.')
  expect(screen.queryByText('2 equipamentos')).not.toBeInTheDocument()
  shouldFail = false
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByText('2 equipamentos')).toBeInTheDocument()
})

test('exports the loaded report as CSV and PDF through the authenticated API', async () => {
  const user = userEvent.setup()
  const exportedFormats: string[] = []
  const createdUrls: string[] = []
  const revokedUrls: string[] = []
  const clickedDownloads: string[] = []
  const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    const url = `blob:report-${createdUrls.length + 1}`
    createdUrls.push(url)
    return url
  })
  const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => { revokedUrls.push(url) })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clickedDownloads.push(this.download) })
  server.use(
    http.get('*/api/v1/reports/inventory-summary', () => HttpResponse.json(reportResponse)),
    http.get('*/api/v1/reports/inventory-summary/export', ({ request }) => {
      const format = new URL(request.url).searchParams.get('format') ?? ''
      exportedFormats.push(format)
      return new HttpResponse(format === 'pdf' ? '%PDF-1.4 test' : 'Unidade,Total\nUnidade Centro,2', {
        headers: {
          'Content-Type': format === 'pdf' ? 'application/pdf' : 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="inventory-summary.${format}"`,
        },
      })
    }),
  )

  renderReports()

  expect(await screen.findByText('2 equipamentos')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Exportar CSV' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Exportação CSV preparada.')
  await user.click(screen.getByRole('button', { name: 'Exportar PDF' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Exportação PDF preparada.')
  expect(exportedFormats).toEqual(['csv', 'pdf'])
  expect(createdUrls).toEqual(['blob:report-1', 'blob:report-2'])
  expect(revokedUrls).toEqual(createdUrls)
  expect(clickedDownloads).toEqual(['inventory-summary.csv', 'inventory-summary.pdf'])
  createObjectUrl.mockRestore()
  revokeObjectUrl.mockRestore()
  click.mockRestore()
})
