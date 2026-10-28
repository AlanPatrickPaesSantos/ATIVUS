import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/api/errors'
import { AcMaterialsPage } from './AcMaterialsPage'

const apiState = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock('../api/acApi', () => ({
  createAcMaterial: apiState.create,
}))

vi.mock('../api/acQueries', () => ({
  useAcMaterialsQuery: () => ({ data: { items: [{ id: '1', patrimony: 'AC-1', type: 'Rádio', model: 'X', brand: 'Y', situation: 'active', location: 'AC', unit: null, custody: { scope: 'AC', unit: null }, category: 'Comunicação', history: [] }], total: 1 }, isLoading: false, isError: false }),
  useAcMaterialQuery: () => ({ isLoading: false, isError: false }),
  useInvalidateAcQueries: () => vi.fn(),
}))

const session = { userId: 'ac', name: 'AC', registration: '1', role: 'ac_operator' as const, unit: null }
const renderPage = (role: 'ac_operator' | 'ditel_admin') => render(<QueryClientProvider client={new QueryClient()}><AcMaterialsPage session={{ ...session, role }} /></QueryClientProvider>)

afterEach(() => {
  apiState.create.mockReset()
})

describe('AcMaterialsPage', () => {
  it('lista materiais e mostra cadastro somente ao operador AC', () => {
    renderPage('ac_operator')
    expect(screen.getByRole('region', { name: 'Materiais da AC' })).toHaveClass('ac-materials-page')
    expect(screen.getByRole('searchbox', { name: 'Pesquisar RP, N/S ou descrição' })).toHaveClass('ac-control')
    expect(screen.getByRole('navigation', { name: 'Paginação dos materiais AC' })).toHaveClass('ac-pagination')
    expect(screen.getByRole('heading', { name: 'Materiais da AC' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cadastrar material/i })).toBeInTheDocument()
    expect(screen.getByText('AC-1')).toBeInTheDocument()
  })
  it('mantém a consulta para DITEL, sem exibir ação de cadastro', () => {
    renderPage('ditel_admin')
    expect(screen.queryByRole('button', { name: /cadastrar material/i })).not.toBeInTheDocument()
  })

  it('apresenta o cadastro AC em seções com campos em português e ações claras', async () => {
    const user = userEvent.setup()
    apiState.create.mockResolvedValueOnce({ id: 'created' })
    renderPage('ac_operator')

    await user.click(screen.getByRole('button', { name: /cadastrar material/i }))

    const dialog = screen.getByRole('dialog', { name: 'Cadastrar material AC' })
    expect(within(dialog).getByRole('group', { name: 'Identificação' })).toBeInTheDocument()
    expect(within(dialog).getByRole('group', { name: 'Patrimônio e situação' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/RP patrimonial/)).toBeRequired()
    expect(within(dialog).getByLabelText(/Tipo de equipamento/)).toBeRequired()
    expect(within(dialog).getByLabelText(/^Modelo/)).toBeRequired()
    expect(within(dialog).getByLabelText(/^Marca/)).toBeRequired()
    expect(within(dialog).getByLabelText(/^Categoria/)).not.toBeRequired()
    expect(within(dialog).getByLabelText(/^Número de série/)).not.toBeRequired()
    expect(within(dialog).getByLabelText(/Localização/)).toBeRequired()
    expect(within(dialog).getByLabelText(/Situação/)).toBeRequired()
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cadastrar material' })).toBeInTheDocument()
    expect(within(dialog).getByText('O material será criado sem associação a uma unidade operacional.')).toBeInTheDocument()
  })

  it('fecha o cadastro pelo botão Cancelar sem enviar dados', async () => {
    const user = userEvent.setup()
    renderPage('ac_operator')

    await user.click(screen.getByRole('button', { name: /cadastrar material/i }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog', { name: 'Cadastrar material AC' })).not.toBeInTheDocument()
    expect(apiState.create).not.toHaveBeenCalled()
  })

  it('envia os campos preenchidos e bloqueia o botão durante o cadastro', async () => {
    const user = userEvent.setup()
    let resolve!: (value: { id: string }) => void
    apiState.create.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    renderPage('ac_operator')

    await user.click(screen.getByRole('button', { name: /cadastrar material/i }))
    const dialog = screen.getByRole('dialog', { name: 'Cadastrar material AC' })
    await user.type(within(dialog).getByLabelText(/RP patrimonial/), 'RP-001')
    await user.type(within(dialog).getByLabelText(/Tipo de equipamento/), 'Rádio portátil')
    await user.type(within(dialog).getByLabelText(/^Modelo/), 'APX 2000')
    await user.type(within(dialog).getByLabelText(/^Marca/), 'Motorola')
    await user.type(within(dialog).getByLabelText(/^Categoria/), 'Comunicação')
    await user.type(within(dialog).getByLabelText(/^Número de série/), 'SN-001')
    await user.type(within(dialog).getByLabelText(/Localização/), 'Almoxarifado AC')
    await user.selectOptions(within(dialog).getByLabelText(/Situação/), 'maintenance')
    await user.type(within(dialog).getByLabelText(/^Observações/), 'Recebido para distribuição')
    const submit = within(dialog).getByRole('button', { name: 'Cadastrar material' })
    await user.click(submit)

    expect(submit).toBeDisabled()
    expect(apiState.create).toHaveBeenCalledTimes(1)
    expect(apiState.create.mock.calls[0][0]).toEqual(expect.objectContaining({ patrimony: 'RP-001', type: 'Rádio portátil', situation: 'maintenance', location: 'Almoxarifado AC' }))
    resolve({ id: 'created' })
  })

  it('exibe a mensagem de patrimônio duplicado retornada pelo backend', async () => {
    const user = userEvent.setup()
    apiState.create.mockRejectedValueOnce(new ApiError(409, { code: 'DUPLICATE_PATRIMONY', message: 'Patrimônio já cadastrado.' }))
    renderPage('ac_operator')

    await user.click(screen.getByRole('button', { name: /cadastrar material/i }))
    const dialog = screen.getByRole('dialog', { name: 'Cadastrar material AC' })
    await user.type(within(dialog).getByLabelText(/RP patrimonial/), 'RP-001')
    await user.type(within(dialog).getByLabelText(/Tipo de equipamento/), 'Rádio')
    await user.type(within(dialog).getByLabelText(/^Modelo/), 'APX')
    await user.type(within(dialog).getByLabelText(/^Marca/), 'Motorola')
    await user.type(within(dialog).getByLabelText(/Localização/), 'AC')
    await user.click(within(dialog).getByRole('button', { name: 'Cadastrar material' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('RP já cadastrado.')
    expect(within(dialog).getByRole('button', { name: 'Cadastrar material' })).toBeEnabled()
  })
})
