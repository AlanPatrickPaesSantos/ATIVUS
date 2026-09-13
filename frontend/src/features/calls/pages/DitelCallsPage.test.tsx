import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DitelCallsPage } from './DitelCallsPage'

afterEach(() => {
  vi.restoreAllMocks()
})

test('replaces the fallback queue with loading, error and retry states for statewide calls', async () => {
  const user = userEvent.setup()
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'call-402', subject: 'Rádio operacional indisponível', unitId: 'unit-centro', unitName: 'Unidade Centro', priority: 'Crítica', status: 'Em atendimento', updatedAt: '2026-08-30T08:01:00.000Z' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

  render(<MemoryRouter><DitelCallsPage /></MemoryRouter>)

  expect(await screen.findByRole('status')).toHaveTextContent('Carregando chamados estaduais')
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os chamados estaduais.')
  expect(screen.queryByRole('heading', { name: 'Rádio operacional indisponível' })).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

  expect(await screen.findByRole('heading', { name: 'Rádio operacional indisponível' })).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('opens the DITEL triage flow from a statewide pending call', async () => {
  const user = userEvent.setup()
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'call-402', subject: 'Rádio operacional indisponível', unitId: 'unit-centro', unitName: 'Unidade Centro', priority: 'Crítica', status: 'Em atendimento', updatedAt: '2026-08-30T08:01:00.000Z' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'call-402', protocol: 'CH-2026-0402', problem: 'radio', subject: 'Rádio operacional indisponível', unitId: 'unit-centro', unitName: 'Unidade Centro', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, priority: 'Crítica', status: 'Em atendimento', section: 'Telecom', description: 'Descrição persistida da API para o rádio operacional.', requestedBy: 'Operador persistido', equipment: { id: 'eq-001', patrimony: 'PAT-2026-004821', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola' }, openedAt: '2026-08-30T08:01:00.000Z', updatedAt: '2026-08-30T08:01:00.000Z', attachments: [], history: [{ id: 'call-opened-call-402', description: 'Chamado aberto pela Unidade.', occurredAt: '2026-08-30T08:01:00.000Z' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'call-402', subject: 'Rádio operacional indisponível', unitId: 'unit-centro', unitName: 'Unidade Centro', priority: 'Alta', status: 'Resolvido', section: 'Suporte', updatedAt: '2026-08-30T09:00:00.000Z' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  render(<MemoryRouter><DitelCallsPage /></MemoryRouter>)

  expect(screen.getByRole('combobox', { name: 'Situação do chamado' })).toHaveValue('pending')
  const callCard = (await screen.findByRole('heading', { name: 'Rádio operacional indisponível' })).closest('article')
  await user.click(within(callCard as HTMLElement).getByRole('button', { name: 'Triar chamado' }))

  expect(screen.getByRole('dialog', { name: 'Triagem do chamado' })).toBeInTheDocument()
  expect(screen.getByText('Informações da solicitação')).toBeInTheDocument()
  expect(screen.getByText('Descrição informada')).toBeInTheDocument()
  expect(screen.getByText('Equipamento relacionado')).toBeInTheDocument()
  const dialog = screen.getByRole('dialog', { name: 'Triagem do chamado' })
  expect(await within(dialog).findByText('Descrição persistida da API para o rádio operacional.')).toBeInTheDocument()
  expect(within(dialog).getByText('Rádio portátil · PAT-2026-004821')).toBeInTheDocument()
  expect(within(dialog).getByText('Operador persistido')).toBeInTheDocument()
  expect(within(dialog).getByText('Chamado aberto pela Unidade.')).toBeInTheDocument()
  expect(within(dialog).queryByText('O rádio operacional apresenta falha de comunicação e não completa transmissões. A equipe da Unidade solicita avaliação técnica.')).not.toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Prioridade' })).toBeInTheDocument()
  await user.selectOptions(screen.getByRole('combobox', { name: 'Prioridade' }), 'high')
  await user.selectOptions(screen.getByRole('combobox', { name: 'Seção responsável' }), 'Suporte')
  await user.selectOptions(screen.getByRole('combobox', { name: 'Situação da triagem' }), 'Resolvido')
  await user.click(screen.getByRole('button', { name: 'Salvar triagem' }))

  expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
    status: 'Resolvido',
    priority: 'high',
    section: 'Suporte',
    updatedAt: '2026-08-30T08:01:00.000Z',
  })
  expect(String(fetchMock.mock.calls[2]?.[1]?.body)).not.toMatch(/description|token|password|senha|session/i)
  expect(screen.getByRole('status')).toHaveTextContent('Triagem registrada')
  expect(screen.getByText('Alta')).toBeInTheDocument()
  await user.selectOptions(screen.getByRole('combobox', { name: 'Situação do chamado' }), 'resolved')
  expect(screen.getByRole('heading', { name: 'Rádio operacional indisponível' })).toBeInTheDocument()
  expect(screen.getByText('Suporte', { selector: 'dd' })).toBeInTheDocument()
})

test('shows detail loading, error and retry inside the DITEL triage modal', async () => {
  const user = userEvent.setup()
  let resolveDetails!: (response: Response) => void
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'call-402', subject: 'Rádio operacional indisponível', unitId: 'unit-centro', unitName: 'Unidade Centro', priority: 'Crítica', status: 'Em atendimento', updatedAt: '2026-08-30T08:01:00.000Z' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveDetails = resolve }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'call-402', protocol: 'CH-2026-0402', problem: 'radio', subject: 'Rádio operacional indisponível', unitId: 'unit-centro', unitName: 'Unidade Centro', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, priority: 'Crítica', status: 'Em atendimento', section: 'Telecom', description: 'Detalhe recuperado após retry.', requestedBy: 'Operador persistido', equipment: null, openedAt: '2026-08-30T08:01:00.000Z', updatedAt: '2026-08-30T08:01:00.000Z', attachments: [], history: [{ id: 'call-opened-call-402', description: 'Chamado aberto pela Unidade.', occurredAt: '2026-08-30T08:01:00.000Z' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

  render(<MemoryRouter><DitelCallsPage /></MemoryRouter>)

  const callCard = (await screen.findByRole('heading', { name: 'Rádio operacional indisponível' })).closest('article')
  await user.click(within(callCard as HTMLElement).getByRole('button', { name: 'Triar chamado' }))
  const dialog = screen.getByRole('dialog', { name: 'Triagem do chamado' })

  expect(within(dialog).getByRole('status')).toHaveTextContent('Carregando detalhes do chamado')
  resolveDetails(new Response(JSON.stringify({ code: 'DETAILS_DOWN', message: 'Detalhes indisponíveis.' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Não foi possível carregar os detalhes do chamado.')
  await user.click(within(dialog).getByRole('button', { name: 'Tentar carregar detalhes novamente' }))

  expect(await within(dialog).findByText('Detalhe recuperado após retry.')).toBeInTheDocument()
  expect(within(dialog).getByText('Chamado aberto pela Unidade.')).toBeInTheDocument()
})

test('keeps the triage modal open after stale conflict and retries with refreshed call data', async () => {
  const user = userEvent.setup()
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'call-402', subject: 'Rádio operacional indisponível', unitId: 'unit-centro', unitName: 'Unidade Centro', priority: 'Crítica', status: 'Em atendimento', section: 'Telecom', updatedAt: '2026-08-30T08:01:00.000Z' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'call-402', protocol: 'CH-2026-0402', problem: 'radio', subject: 'Rádio operacional indisponível', unitId: 'unit-centro', unitName: 'Unidade Centro', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, priority: 'Crítica', status: 'Em atendimento', section: 'Telecom', description: 'Descrição persistida da API para o rádio operacional.', requestedBy: 'Operador persistido', equipment: null, openedAt: '2026-08-30T08:01:00.000Z', updatedAt: '2026-08-30T08:01:00.000Z', attachments: [], history: [{ id: 'call-opened-call-402', description: 'Chamado aberto pela Unidade.', occurredAt: '2026-08-30T08:01:00.000Z' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'USER_CONFLICT', message: 'O chamado foi alterado por outra operação. Recarregue os dados e tente novamente.' }), { status: 409, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'call-402', subject: 'Rádio operacional indisponível', unitId: 'unit-centro', unitName: 'Unidade Centro', priority: 'Alta', status: 'Em análise', section: 'Telecom', updatedAt: '2026-08-30T10:00:00.000Z' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'call-402', protocol: 'CH-2026-0402', problem: 'radio', subject: 'Rádio operacional indisponível', unitId: 'unit-centro', unitName: 'Unidade Centro', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, priority: 'Alta', status: 'Em análise', section: 'Telecom', description: 'Descrição atualizada após conflito.', requestedBy: 'Operador persistido', equipment: null, openedAt: '2026-08-30T08:01:00.000Z', updatedAt: '2026-08-30T10:00:00.000Z', attachments: [], history: [{ id: 'call-opened-call-402', description: 'Chamado aberto pela Unidade.', occurredAt: '2026-08-30T08:01:00.000Z' }, { id: 'call-triage-conflict', description: 'Triagem DITEL registrada: Em atendimento → Em análise.', occurredAt: '2026-08-30T10:00:00.000Z' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'call-402', subject: 'Rádio operacional indisponível', unitId: 'unit-centro', unitName: 'Unidade Centro', priority: 'Alta', status: 'Resolvido', section: 'Suporte', updatedAt: '2026-08-30T10:05:00.000Z' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

  render(<MemoryRouter><DitelCallsPage /></MemoryRouter>)

  const callCard = (await screen.findByRole('heading', { name: 'Rádio operacional indisponível' })).closest('article')
  await user.click(within(callCard as HTMLElement).getByRole('button', { name: 'Triar chamado' }))
  await user.selectOptions(screen.getByRole('combobox', { name: 'Prioridade' }), 'high')
  await user.selectOptions(screen.getByRole('combobox', { name: 'Seção responsável' }), 'Suporte')
  await user.selectOptions(screen.getByRole('combobox', { name: 'Situação da triagem' }), 'Resolvido')
  await user.click(screen.getByRole('button', { name: 'Salvar triagem' }))

  const dialog = screen.getByRole('dialog', { name: 'Triagem do chamado' })
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('O chamado foi alterado por outra operação.')
  expect(within(dialog).getByText('Chamado recebido da Unidade · situação atual: Em atendimento')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Recarregar dados atuais' })).toBeInTheDocument()

  await user.click(within(dialog).getByRole('button', { name: 'Recarregar dados atuais' }))

  expect(await within(dialog).findByText('Dados atuais recarregados. Revise o histórico e tente salvar novamente.')).toBeInTheDocument()
  expect(within(dialog).getByText('Chamado recebido da Unidade · situação atual: Em análise')).toBeInTheDocument()
  expect(within(dialog).getByText('Triagem DITEL registrada: Em atendimento → Em análise.')).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Tentar novamente' }))

  expect(JSON.parse(String(fetchMock.mock.calls[5]?.[1]?.body))).toEqual({
    status: 'Resolvido',
    priority: 'high',
    section: 'Suporte',
    updatedAt: '2026-08-30T10:00:00.000Z',
  })
  expect(screen.getByRole('status')).toHaveTextContent('Triagem registrada')
})
