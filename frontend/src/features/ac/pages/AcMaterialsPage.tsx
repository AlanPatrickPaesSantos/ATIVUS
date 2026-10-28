import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { AcMaterial, AcMaterialCreateInput } from '../../../shared/api/contracts'
import type { SessionContext } from '../../../shared/auth/types'
import { ApiError } from '../../../shared/api/errors'
import { createAcMaterial } from '../api/acApi'
import { useAcMaterialQuery, useAcMaterialsQuery, useInvalidateAcQueries } from '../api/acQueries'
import { DataTable } from '../../../shared/ui/data/DataTable'
import { EmptyState } from '../../../shared/ui/feedback/EmptyState'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { Modal } from '../../../shared/ui/overlays/Modal'
import { AcMaterialForm } from '../components/AcMaterialForm'

const emptyForm: AcMaterialCreateInput = { patrimony: '', type: '', model: '', brand: '', situation: 'active', location: '', category: '', serialNumber: '', warranty: '', observations: '' }
const messageFor = (error: unknown) => error instanceof ApiError ? (error.status === 409 ? 'RP já cadastrado.' : error.status === 403 ? 'Seu perfil não pode cadastrar materiais AC.' : error.message) : 'Falha de rede. Tente novamente.'

export function AcMaterialsPage({ session }: { session: SessionContext }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [feedback, setFeedback] = useState<string | null>(null)
  const query = useAcMaterialsQuery({ search, page, pageSize: 10 })
  const detail = useAcMaterialQuery(selectedId)
  const invalidate = useInvalidateAcQueries()
  const mutation = useMutation({ mutationFn: createAcMaterial, onSuccess: async () => { await invalidate(); setCreateOpen(false); setForm(emptyForm); setFeedback('Material AC cadastrado com sucesso.') } })
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 10))
  const canCreate = session.role === 'ac_operator'
  const columns = useMemo(() => [
    { id: 'rp', header: 'RP', cell: (item: AcMaterial) => <strong>{item.patrimony}</strong> },
    { id: 'serial', header: 'N/S', cell: (item: AcMaterial) => item.serialNumber || '—' },
    { id: 'identity', header: 'Identificação', cell: (item: AcMaterial) => `${item.type} · ${item.brand} ${item.model}` },
    { id: 'category', header: 'Categoria', cell: (item: AcMaterial) => item.category || '—' },
    { id: 'situation', header: 'Estado', cell: (item: AcMaterial) => item.situation },
  ], [])

  function closeCreate() { mutation.reset(); setCreateOpen(false); setForm(emptyForm) }
  function openCreate() { mutation.reset(); setFeedback(null); setForm(emptyForm); setCreateOpen(true) }
  function submit() { setFeedback(null); mutation.mutate(form) }
  function update<K extends keyof AcMaterialCreateInput>(key: K, value: AcMaterialCreateInput[K]) { setForm((current) => ({ ...current, [key]: value })) }

  return <section className="module-page ac-materials-page" aria-labelledby="ac-materials-title">
    <header className="module-page__header"><div><p className="page-eyebrow">Custódia patrimonial · AC</p><h1 id="ac-materials-title">Materiais da AC</h1><p>Estoque central de bens patrimoniais recebidos pela AC.</p></div>{canCreate && <button className="button-link button-link--primary" type="button" onClick={openCreate}>+ Cadastrar material</button>}</header>
    {feedback && <p role="status">{feedback}</p>}
    <form className="module-toolbar ac-materials-toolbar" onSubmit={(event) => { event.preventDefault(); setPage(1) }}><label className="ac-field">Pesquisar RP, N/S ou descrição<input className="ac-control" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button className="button-link" type="submit">Pesquisar</button></form>
    <div className="ac-materials-table"><DataTable columns={columns} data={query.data?.items ?? []} rowKey={(item) => item.id} loading={query.isLoading} error={query.isError ? <ErrorState message="Não foi possível carregar o estoque AC." onRetry={() => void query.refetch()} /> : undefined} empty={<EmptyState title="Nenhum material na AC" description="Ajuste a pesquisa ou cadastre um novo bem patrimonial." />} onRowClick={(item) => setSelectedId(item.id)} /></div>
    <nav className="ac-pagination" aria-label="Paginação dos materiais AC"><button className="button-link" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><span> Página {page} de {totalPages} </span><button className="button-link" type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Próxima</button></nav>
    <Modal open={Boolean(selectedId)} title="Detalhe do material AC" onClose={() => setSelectedId(null)}>{detail.isLoading ? <p>Carregando...</p> : detail.isError ? <ErrorState message="Não foi possível consultar o material." /> : detail.data && <div><p><strong>RP:</strong> {detail.data.patrimony}</p><p><strong>N/S:</strong> {detail.data.serialNumber || 'Não informado'}</p><p><strong>Custódia:</strong> AC</p><p><strong>Histórico:</strong> {detail.data.history.length} registro(s)</p></div>}</Modal>
    <Modal open={createOpen} title="Cadastrar material AC" onClose={closeCreate} size="lg" className="ac-material-modal"><AcMaterialForm value={form} pending={mutation.isPending} error={mutation.isError ? messageFor(mutation.error) : undefined} onChange={update} onCancel={closeCreate} onSubmit={submit} /></Modal>
  </section>
}
