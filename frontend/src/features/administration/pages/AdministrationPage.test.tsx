import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, beforeEach, afterEach, test, expect } from 'vitest'
import userEvent from '@testing-library/user-event'
import { AdministrationPage } from './AdministrationPage'
beforeEach(() => vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
  const url = new URL(String(input), 'http://localhost')
  if (url.pathname.endsWith('/units')) return new Response(JSON.stringify({ items: [{ id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }] }), { status: 200 })
  return new Response(JSON.stringify({ items: [{ id: '1', name: 'Ana Souza', registration: '123', role: 'unit_user', situation: 'active', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' }], total: 1, page: 1, pageSize: 100 }), { status: 200 })
}))
afterEach(() => vi.restoreAllMocks())
test('loads public administrative users and preserves links', async () => { render(<MemoryRouter><AdministrationPage /></MemoryRouter>); expect(await screen.findByText('Ana Souza')).toBeInTheDocument(); expect(screen.getByRole('link', { name: 'Consultar inventário estadual' })).toHaveAttribute('href', '/inventario'); expect(screen.queryByText('passwordHash')).not.toBeInTheDocument() })
test('shows retry after an API failure', async () => { vi.restoreAllMocks(); const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline')); render(<MemoryRouter><AdministrationPage /></MemoryRouter>); expect(await screen.findByRole('alert')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument(); expect(fetchMock).toHaveBeenCalled() })
test('preserves the units tab and user details modal', async () => { render(<MemoryRouter><AdministrationPage /></MemoryRouter>); expect(await screen.findByText('Ana Souza')).toBeInTheDocument(); await userEvent.click(screen.getByRole('tab', { name: 'Unidades' })); expect(screen.getByRole('heading', { name: 'Unidades cadastradas' })).toBeInTheDocument(); await userEvent.click(screen.getByRole('tab', { name: 'Usuários' })); await userEvent.click(screen.getByRole('button', { name: /ver detalhes de ana souza/i })); expect(screen.getByRole('dialog', { name: 'Detalhes do usuário' })).toBeInTheDocument() })

test('uses factual administrative copy instead of promising future access and audit persistence', async () => {
  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)
  await screen.findByText('Ana Souza')

  expect(screen.queryByText('Os dados de acesso e auditoria serão persistidos quando a integração corporativa estiver disponível.')).not.toBeInTheDocument()
  expect(screen.getByText('Usuários e eventos de auditoria são registrados pelo backend; use os atalhos para acompanhar inventário e chamados.')).toBeInTheDocument()
})

test('renders accessible headers and cells for administrative custom tables', async () => {
  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)
  await screen.findByText('Ana Souza')

  const usersTable = screen.getByRole('table', { name: 'Usuários DITEL' })
  expect(within(usersTable).getByRole('columnheader', { name: 'Usuário' })).toBeInTheDocument()
  expect(within(usersTable).getByRole('columnheader', { name: 'Perfil' })).toBeInTheDocument()
  expect(within(usersTable).getByRole('columnheader', { name: 'Unidade' })).toBeInTheDocument()
  expect(within(usersTable).getByRole('columnheader', { name: 'Situação' })).toBeInTheDocument()
  expect(within(usersTable).getByRole('columnheader', { name: 'Ações' })).toBeInTheDocument()
  expect(within(screen.getByRole('row', { name: /Ana Souza/ })).getAllByRole('cell')).toHaveLength(5)

  await userEvent.click(screen.getByRole('tab', { name: 'Unidades' }))

  const unitsTable = await screen.findByRole('table', { name: 'Unidades DITEL' })
  expect(within(unitsTable).getByRole('columnheader', { name: 'Unidade' })).toBeInTheDocument()
  expect(within(unitsTable).getByRole('columnheader', { name: 'Cobertura' })).toBeInTheDocument()
  expect(within(unitsTable).getByRole('columnheader', { name: 'Equipamentos' })).toBeInTheDocument()
  expect(within(unitsTable).getByRole('columnheader', { name: 'Atenção' })).toBeInTheDocument()
  expect(within(unitsTable).getByRole('columnheader', { name: 'Ações' })).toBeInTheDocument()
  expect(within(screen.getByRole('row', { name: /Unidade Centro/ })).getAllByRole('cell')).toHaveLength(5)
})

test('renders the situation action alongside the read-only user detail tabs', async () => {
  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)
  await screen.findByText('Ana Souza')
  await userEvent.click(screen.getByRole('button', { name: /ver detalhes de ana souza/i }))

  const dialog = screen.getByRole('dialog', { name: 'Detalhes do usuário' })
  expect(within(dialog).getByRole('tab', { name: 'Dados institucionais' })).toBeInTheDocument()
  expect(within(dialog).getByRole('tab', { name: 'Acesso e perfil' })).toBeInTheDocument()
  expect(within(dialog).getByRole('tab', { name: 'Unidade vinculada' })).toBeInTheDocument()
  expect(within(dialog).getByRole('tab', { name: 'Histórico' })).toBeInTheDocument()
  expect(within(dialog).getByRole('tab', { name: 'Atividade e auditoria' })).toBeInTheDocument()
  expect(within(dialog).getByRole('tabpanel')).toHaveTextContent('Ana Souza')
  expect(within(dialog).getByRole('button', { name: 'Bloquear usuário' })).toBeInTheDocument()

  await userEvent.click(within(dialog).getByRole('tab', { name: 'Histórico' }))
  expect(within(dialog).getByRole('tabpanel')).toHaveTextContent('Histórico administrativo')
})

test('confirms a block, sends the PATCH and refreshes the current list', async () => {
  vi.restoreAllMocks()
  let situation: 'active' | 'blocked' = 'active'
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/units')) return new Response(JSON.stringify({ items: [{ id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }] }), { status: 200 })
    if (url.pathname.endsWith('/situation')) {
      situation = 'blocked'
      return new Response(JSON.stringify({ id: '1', situation }), { status: 200 })
    }
    return new Response(JSON.stringify({ items: [{ id: '1', name: 'Ana Souza', registration: '123', role: 'unit_user', situation, unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' }], total: 1, page: 1, pageSize: 20 }), { status: 200 })
  })

  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)
  await screen.findByText('Ana Souza')
  await userEvent.click(screen.getByRole('button', { name: /ver detalhes de ana souza/i }))
  const dialog = screen.getByRole('dialog', { name: 'Detalhes do usuário' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Bloquear usuário' }))
  expect(within(dialog).getByText('Confirmar bloqueio de Ana Souza?')).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar bloqueio' }))

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/users/1/situation'), expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ situation: 'blocked' }), credentials: 'include' })))
  expect(within(await screen.findByRole('row', { name: /Ana Souza/ })).getByText('Bloqueado')).toBeInTheDocument()
  expect(screen.queryByRole('dialog', { name: 'Detalhes do usuário' })).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/users?page=1&pageSize=20'), expect.objectContaining({ credentials: 'include' }))
})

test('keeps the confirmation open and offers retry after a situation update error', async () => {
  vi.restoreAllMocks()
  let patchAttempts = 0
  let situation: 'active' | 'blocked' = 'active'
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/units')) return new Response(JSON.stringify({ items: [] }), { status: 200 })
    if (url.pathname.endsWith('/situation')) {
      patchAttempts += 1
      if (patchAttempts === 1) return new Response(JSON.stringify({ code: 'INVALID_SITUATION_TRANSITION', message: 'Transição de situação inválida.' }), { status: 409 })
      situation = 'blocked'
      return new Response(JSON.stringify({ id: '1', situation }), { status: 200 })
    }
    return new Response(JSON.stringify({ items: [{ id: '1', name: 'Ana Souza', registration: '123', role: 'unit_user', situation, unit: null, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' }], total: 1, page: 1, pageSize: 20 }), { status: 200 })
  })

  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)
  await screen.findByText('Ana Souza')
  await userEvent.click(screen.getByRole('button', { name: /ver detalhes de ana souza/i }))
  const dialog = screen.getByRole('dialog', { name: 'Detalhes do usuário' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Bloquear usuário' }))
  await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar bloqueio' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Transição de situação inválida.')
  expect(within(dialog).getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Tentar novamente' }))
  expect(within(await screen.findByRole('row', { name: /Ana Souza/ })).getByText('Bloqueado')).toBeInTheDocument()
  expect(patchAttempts).toBe(2)
})

test('edits a user profile through a dedicated modal and refreshes the filtered list', async () => {
  vi.restoreAllMocks()
  const requests: string[] = []
  let edited = false
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`)
    if (url.pathname.endsWith('/units')) return new Response(JSON.stringify({ items: [{ id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' }] }), { status: 200 })
    if (init?.method === 'PATCH' && url.pathname === '/api/v1/admin/users/1') {
      edited = true
      expect(init.body).toBe(JSON.stringify({ name: 'Ana Editada', registration: '123', role: 'unit_user', unit: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' }, updatedAt: '2026-08-30T10:00:00Z' }))
      return new Response(JSON.stringify({ id: '1', name: 'Ana Editada', registration: '123', role: 'unit_user', situation: 'active', unit: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T11:00:00Z' }), { status: 200 })
    }
    const page = Number(url.searchParams.get('page'))
    const initial = page === 2 ? { id: '1', name: 'Ana Souza', registration: '123', role: 'unit_user', situation: 'active', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' } : { id: '0', name: 'Outro Usuário', registration: '000', role: 'ditel_admin', situation: 'active', unit: null, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' }
    const updated = { id: '1', name: 'Ana Editada', registration: '123', role: 'unit_user', situation: 'active', unit: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T11:00:00Z' }
    return new Response(JSON.stringify({ items: [edited ? updated : initial], total: 21, page, pageSize: 20 }), { status: 200 })
  })

  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)
  await screen.findByText('Outro Usuário')
  await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
  await screen.findByText('Ana Souza')
  await userEvent.click(screen.getByRole('button', { name: /ver detalhes de ana souza/i }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Detalhes do usuário' })).getByRole('button', { name: 'Editar usuário' }))

  const editDialog = screen.getByRole('dialog', { name: 'Editar usuário' })
  await userEvent.clear(within(editDialog).getByLabelText('Nome completo'))
  await userEvent.type(within(editDialog).getByLabelText('Nome completo'), 'Ana Editada')
  await userEvent.selectOptions(within(editDialog).getByLabelText('Unidade'), 'unit-norte')
  await userEvent.click(within(editDialog).getByRole('button', { name: 'Salvar alterações' }))

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Usuário Ana Editada atualizado com sucesso.'))
  expect(screen.queryByRole('dialog', { name: 'Editar usuário' })).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog', { name: 'Detalhes do usuário' })).not.toBeInTheDocument()
  expect(within(await screen.findByRole('row', { name: /Ana Editada/ })).getByText('Unidade Norte')).toBeInTheDocument()
  expect(requests.some((request) => request.startsWith('PATCH /api/v1/admin/users/1'))).toBe(true)
  expect(requests.some((request) => request.startsWith('GET /api/v1/admin/users?page=2&pageSize=20'))).toBe(true)
})

test('keeps the edit modal open and offers retry after a server error', async () => {
  vi.restoreAllMocks()
  let patchAttempts = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/units')) return new Response(JSON.stringify({ items: [{ id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }] }), { status: 200 })
    if (init?.method === 'PATCH' && url.pathname === '/api/v1/admin/users/1') {
      patchAttempts += 1
      if (patchAttempts === 1) return new Response(JSON.stringify({ code: 'REGISTRATION_CONFLICT', message: 'Matrícula já cadastrada.' }), { status: 409 })
      return new Response(JSON.stringify({ id: '1', name: 'Ana Souza', registration: '123', role: 'unit_user', situation: 'active', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T11:00:00Z' }), { status: 200 })
    }
    return new Response(JSON.stringify({ items: [{ id: '1', name: 'Ana Souza', registration: '123', role: 'unit_user', situation: 'active', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' }], total: 1, page: 1, pageSize: 20 }), { status: 200 })
  })

  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)
  await screen.findByText('Ana Souza')
  await userEvent.click(screen.getByRole('button', { name: /ver detalhes de ana souza/i }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Detalhes do usuário' })).getByRole('button', { name: 'Editar usuário' }))
  const editDialog = screen.getByRole('dialog', { name: 'Editar usuário' })
  await userEvent.click(within(editDialog).getByRole('button', { name: 'Salvar alterações' }))
  expect(await within(editDialog).findByRole('alert')).toHaveTextContent('Matrícula já cadastrada.')
  expect(within(editDialog).getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument()
  await userEvent.click(within(editDialog).getByRole('button', { name: 'Tentar novamente' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar usuário' })).not.toBeInTheDocument())
  expect(patchAttempts).toBe(2)
})

test('keeps local edit draft on concurrency conflict and refreshes the token safely', async () => {
  vi.restoreAllMocks()
  let patchAttempts = 0
  let refreshAfterConflict = false
  const bodies: unknown[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/units')) return new Response(JSON.stringify({ items: [{ id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' }] }), { status: 200 })
    if (init?.method === 'PATCH' && url.pathname === '/api/v1/admin/users/1') {
      patchAttempts += 1
      bodies.push(JSON.parse(String(init.body)))
      if (patchAttempts === 1) return new Response(JSON.stringify({ code: 'USER_CONFLICT', message: 'Usuário alterado por outra operação. Recarregue os dados e tente novamente.' }), { status: 409 })
      return new Response(JSON.stringify({ id: '1', name: 'Ana Rascunho', registration: '123', role: 'unit_user', situation: 'active', unit: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:10:00Z' }), { status: 200 })
    }
    const item = refreshAfterConflict
      ? { id: '1', name: 'Ana Paralela', registration: '123', role: 'unit_user', situation: 'active', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:05:00Z' }
      : { id: '1', name: 'Ana Souza', registration: '123', role: 'unit_user', situation: 'active', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' }
    return new Response(JSON.stringify({ items: [item], total: 1, page: 1, pageSize: 20 }), { status: 200 })
  })

  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)
  await screen.findByText('Ana Souza')
  await userEvent.click(screen.getByRole('button', { name: /ver detalhes de ana souza/i }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Detalhes do usuário' })).getByRole('button', { name: 'Editar usuário' }))
  const editDialog = screen.getByRole('dialog', { name: 'Editar usuário' })
  await userEvent.clear(within(editDialog).getByLabelText('Nome completo'))
  await userEvent.type(within(editDialog).getByLabelText('Nome completo'), 'Ana Rascunho')
  await userEvent.selectOptions(within(editDialog).getByLabelText('Unidade'), 'unit-norte')
  await userEvent.click(within(editDialog).getByRole('button', { name: 'Salvar alterações' }))

  expect(await within(editDialog).findByRole('alert')).toHaveTextContent('Usuário alterado por outra operação.')
  expect(within(editDialog).getByLabelText('Nome completo')).toHaveValue('Ana Rascunho')
  refreshAfterConflict = true
  await userEvent.click(within(editDialog).getByRole('button', { name: 'Recarregar dados atuais' }))
  expect(await within(editDialog).findByText('Dados atuais recarregados. Seu rascunho foi preservado.')).toBeInTheDocument()
  expect(within(editDialog).getByLabelText('Nome completo')).toHaveValue('Ana Rascunho')
  await userEvent.click(within(editDialog).getByRole('button', { name: 'Salvar alterações' }))

  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar usuário' })).not.toBeInTheDocument())
  expect(bodies).toEqual([
    expect.objectContaining({ name: 'Ana Rascunho', updatedAt: '2026-08-30T10:00:00Z' }),
    expect.objectContaining({ name: 'Ana Rascunho', updatedAt: '2026-08-30T10:05:00Z' }),
  ])
  expect(patchAttempts).toBe(2)
})

test('does not offer a situation action for inactive users', async () => {
  vi.restoreAllMocks()
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/units')) return new Response(JSON.stringify({ items: [] }), { status: 200 })
    return new Response(JSON.stringify({ items: [{ id: '4', name: 'Diana Alves', registration: '456', role: 'unit_user', situation: 'inactive', unit: null, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' }], total: 1, page: 1, pageSize: 20 }), { status: 200 })
  })
  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)
  await screen.findByText('Diana Alves')
  await userEvent.click(screen.getByRole('button', { name: /ver detalhes de diana alves/i }))
  const dialog = screen.getByRole('dialog', { name: 'Detalhes do usuário' })
  expect(within(dialog).queryByRole('button', { name: /Bloquear usuário|Desbloquear usuário/i })).not.toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/situation'), expect.anything())
})

test('opens a read-only unit detail modal with the planned detail tabs', async () => {
  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)
  await screen.findByText('Ana Souza')
  await userEvent.click(screen.getByRole('tab', { name: 'Unidades' }))
  await userEvent.click(screen.getByRole('button', { name: 'Ver detalhes de Unidade Centro' }))

  const dialog = screen.getByRole('dialog', { name: 'Detalhes da unidade' })
  expect(within(dialog).getByRole('tab', { name: 'Resumo' })).toBeInTheDocument()
  expect(within(dialog).getByRole('tab', { name: 'Inventário' })).toBeInTheDocument()
  expect(within(dialog).getByRole('tab', { name: 'Chamados' })).toBeInTheDocument()
  expect(within(dialog).getByRole('tab', { name: 'Usuários' })).toBeInTheDocument()
  expect(within(dialog).getByRole('tab', { name: 'Histórico administrativo' })).toBeInTheDocument()
  expect(within(dialog).getByRole('tabpanel')).toHaveTextContent('Não informado')

  await userEvent.click(within(dialog).getByRole('tab', { name: 'Inventário' }))
  expect(within(dialog).getByRole('tabpanel')).not.toHaveTextContent('ainda não estão disponíveis')
})

test('loads the units tab from the API without falling back to DITEL fixtures', async () => {
  vi.restoreAllMocks()
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/units')) return new Response(JSON.stringify({ items: [{ id: 'unit-real', name: 'Unidade Real API', acronym: 'URA' }] }), { status: 200 })
    return new Response(JSON.stringify({ items: [{ id: '1', name: 'Ana Souza', registration: '123', role: 'unit_user', situation: 'active', unit: { id: 'unit-real', name: 'Unidade Real API', acronym: 'URA' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' }], total: 1, page: 1, pageSize: 20 }), { status: 200 })
  })

  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)
  await screen.findByText('Ana Souza')
  await userEvent.click(screen.getByRole('tab', { name: 'Unidades' }))

  expect(await screen.findByText('Unidade Real API')).toBeInTheDocument()
  expect(screen.getByText('1 unidade')).toBeInTheDocument()
  expect(screen.queryByText('Unidade Centro')).not.toBeInTheDocument()
})

test('shows a retry action when the units API fails', async () => {
  vi.restoreAllMocks()
  let unitsAttempts = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/units')) {
      unitsAttempts += 1
      if (unitsAttempts === 1) return new Response(JSON.stringify({ code: 'TEMPORARY_UNAVAILABLE', message: 'Não foi possível carregar unidades.' }), { status: 503 })
      return new Response(JSON.stringify({ items: [{ id: 'unit-real', name: 'Unidade Real API', acronym: 'URA' }] }), { status: 200 })
    }
    return new Response(JSON.stringify({ items: [{ id: '1', name: 'Ana Souza', registration: '123', role: 'unit_user', situation: 'active', unit: { id: 'unit-real', name: 'Unidade Real API', acronym: 'URA' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' }], total: 1, page: 1, pageSize: 20 }), { status: 200 })
  })

  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)
  await screen.findByText('Ana Souza')
  await userEvent.click(screen.getByRole('tab', { name: 'Unidades' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar unidades. Tente novamente.')
  await userEvent.click(screen.getByRole('button', { name: 'Tentar carregar unidades novamente' }))

  expect(await screen.findByText('Unidade Real API')).toBeInTheDocument()
  expect(unitsAttempts).toBe(2)
})

test('shows the server total and navigates through administrative pages', async () => {
  vi.restoreAllMocks()
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/units')) return new Response(JSON.stringify({ items: [{ id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }] }), { status: 200 })
    const page = Number(url.searchParams.get('page'))
    const item = page === 1
      ? { id: '1', name: 'Ana Souza', registration: '123', role: 'unit_user', active: true, situation: 'active', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' }
      : { id: '21', name: 'Zeca Lima', registration: '999', role: 'ditel_admin', active: true, situation: 'active', unit: null, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' }
    return new Response(JSON.stringify({ items: [item], total: 21, page, pageSize: 20 }), { status: 200 })
  })

  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)

  expect(await screen.findByText('21 registros')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Próxima página' })).toBeEnabled()
  await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }))

  expect(await screen.findByText('Zeca Lima')).toBeInTheDocument()
  await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('page=2'), expect.objectContaining({ credentials: 'include' })))
})

test('sends the selected unit id while displaying its name', async () => {
  vi.restoreAllMocks()
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/units')) return new Response(JSON.stringify({ items: [{ id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' }] }), { status: 200 })
    const item = { id: '2', name: 'Bruno Lima', registration: '456', role: 'unit_user', active: true, situation: 'active', unit: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' }
    return new Response(JSON.stringify({ items: url.searchParams.get('unitId') === 'unit-norte' ? [item] : [], total: url.searchParams.get('unitId') === 'unit-norte' ? 1 : 0, page: 1, pageSize: 20 }), { status: 200 })
  })

  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)
  const unitFilter = await screen.findByRole('combobox', { name: 'Filtrar usuários por unidade' })
  expect(screen.getByRole('option', { name: 'Unidade Norte' })).toHaveValue('unit-norte')

  await userEvent.selectOptions(unitFilter, 'unit-norte')

  expect(await screen.findByText('Bruno Lima')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('unitId=unit-norte'), expect.objectContaining({ credentials: 'include' }))
})

test('opens the user creation form and validates the required unit', async () => {
  vi.restoreAllMocks()
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/units')) return new Response(JSON.stringify({ items: [{ id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }] }), { status: 200 })
    return new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }), { status: 200 })
  })

  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)
  await screen.findByText('Nenhum usuário encontrado para os filtros informados.')
  await userEvent.click(screen.getByRole('button', { name: 'Cadastrar usuário' }))

  const dialog = screen.getByRole('dialog', { name: 'Cadastrar usuário' })
  await userEvent.type(within(dialog).getByLabelText('Nome completo'), 'Novo Usuário')
  await userEvent.type(within(dialog).getByLabelText('Matrícula'), '30001')
  await userEvent.type(within(dialog).getByLabelText('Senha inicial'), 'senha-segura')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Criar usuário' }))

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Selecione uma unidade para usuários de unidade.')
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/admin/users'), expect.objectContaining({ method: 'POST' }))
})

test('creates a user, reports success, and reloads the current page with its filters', async () => {
  vi.restoreAllMocks()
  const requests: string[] = []
  let created = false
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`)
    if (url.pathname.endsWith('/units')) return new Response(JSON.stringify({ items: [{ id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }] }), { status: 200 })
    if (init?.method === 'POST') {
      created = true
      return new Response(JSON.stringify({ id: 'admin-5', name: 'Novo Usuário', registration: '30001', role: 'unit_user', situation: 'active', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' }), { status: 201 })
    }
    const page = Number(url.searchParams.get('page'))
    const item = page === 2 ? { id: '21', name: 'Zeca Lima', registration: '999', role: 'ditel_admin', situation: 'active', unit: null, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' } : created ? { id: 'admin-5', name: 'Novo Usuário', registration: '30001', role: 'unit_user', situation: 'active', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' } : { id: '1', name: 'Ana Souza', registration: '123', role: 'unit_user', situation: 'active', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' }
    return new Response(JSON.stringify({ items: [item], total: 21, page, pageSize: 20 }), { status: 200 })
  })

  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)
  await screen.findByText('Ana Souza')
  await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
  await screen.findByText('Zeca Lima')
  await userEvent.click(screen.getByRole('button', { name: 'Cadastrar usuário' }))
  const dialog = screen.getByRole('dialog', { name: 'Cadastrar usuário' })
  await userEvent.type(within(dialog).getByLabelText('Nome completo'), 'Novo Usuário')
  await userEvent.type(within(dialog).getByLabelText('Matrícula'), '30001')
  await userEvent.type(within(dialog).getByLabelText('Senha inicial'), 'senha-segura')
  await userEvent.selectOptions(within(dialog).getByLabelText('Unidade'), 'unit-centro')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Criar usuário' }))

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Usuário Novo Usuário cadastrado com sucesso.'))
  expect(screen.queryByRole('dialog', { name: 'Cadastrar usuário' })).not.toBeInTheDocument()
  expect(requests.some((request) => request.startsWith('POST /api/v1/admin/users'))).toBe(true)
  expect(requests.some((request) => request.startsWith('GET /api/v1/admin/users?page=2&pageSize=20'))).toBe(true)
})

test('keeps the creation form open and offers retry after a server error', async () => {
  vi.restoreAllMocks()
  let attempts = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/units')) return new Response(JSON.stringify({ items: [{ id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }] }), { status: 200 })
    if (init?.method === 'POST') {
      attempts += 1
      return attempts === 1 ? new Response(JSON.stringify({ code: 'REGISTRATION_CONFLICT', message: 'Matrícula já cadastrada.' }), { status: 409 }) : new Response(JSON.stringify({ id: 'admin-5', name: 'Novo Usuário', registration: '30001', role: 'unit_user', situation: 'active', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' }), { status: 201 })
    }
    return new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }), { status: 200 })
  })

  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)
  await screen.findByText('Nenhum usuário encontrado para os filtros informados.')
  await userEvent.click(screen.getByRole('button', { name: 'Cadastrar usuário' }))
  const dialog = screen.getByRole('dialog', { name: 'Cadastrar usuário' })
  await userEvent.type(within(dialog).getByLabelText('Nome completo'), 'Novo Usuário')
  await userEvent.type(within(dialog).getByLabelText('Matrícula'), '30001')
  await userEvent.type(within(dialog).getByLabelText('Senha inicial'), 'senha-segura')
  await userEvent.selectOptions(within(dialog).getByLabelText('Unidade'), 'unit-centro')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Criar usuário' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Matrícula já cadastrada.')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Tentar novamente' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Cadastrar usuário' })).not.toBeInTheDocument())
  expect(attempts).toBe(2)
})

test('keeps the created result and offers list retry when the post-create refresh fails', async () => {
  vi.restoreAllMocks()
  let refreshAttempts = 0
  let postAttempts = 0
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/units')) return new Response(JSON.stringify({ items: [{ id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }] }), { status: 200 })
    if (init?.method === 'POST') {
      postAttempts += 1
      return new Response(JSON.stringify({ id: 'admin-5', name: 'Novo Usuário', registration: '30001', role: 'unit_user', situation: 'active', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' }), { status: 201 })
    }
    refreshAttempts += 1
    if (refreshAttempts === 2) return new Response(JSON.stringify({ code: 'TEMPORARY_UNAVAILABLE', message: 'Serviço temporariamente indisponível.' }), { status: 503 })
    return new Response(JSON.stringify({ items: [{ id: '1', name: 'Ana Souza', registration: '123', role: 'unit_user', situation: 'active', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, createdAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z' }], total: 1, page: 1, pageSize: 20 }), { status: 200 })
  })

  render(<MemoryRouter><AdministrationPage /></MemoryRouter>)
  await screen.findByText('Ana Souza')
  await userEvent.click(screen.getByRole('button', { name: 'Cadastrar usuário' }))
  const dialog = screen.getByRole('dialog', { name: 'Cadastrar usuário' })
  await userEvent.type(within(dialog).getByLabelText('Nome completo'), 'Novo Usuário')
  await userEvent.type(within(dialog).getByLabelText('Matrícula'), '30001')
  await userEvent.type(within(dialog).getByLabelText('Senha inicial'), 'senha-segura')
  await userEvent.selectOptions(within(dialog).getByLabelText('Unidade'), 'unit-centro')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Criar usuário' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Usuário Novo Usuário cadastrado, mas a lista não foi atualizada.')
  expect(screen.getByText('Ana Souza')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument()
  expect(postAttempts).toBe(1)
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await waitFor(() => expect(screen.getByText('Ana Souza')).toBeInTheDocument())
  expect(postAttempts).toBe(1)
  expect(fetchMock).toHaveBeenCalledTimes(5)
})
