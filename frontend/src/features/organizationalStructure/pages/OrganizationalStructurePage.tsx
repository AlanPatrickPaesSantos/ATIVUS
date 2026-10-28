import { useState, type FormEvent } from 'react'

import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { EmptyState } from '../../../shared/ui/feedback/EmptyState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'
import type { SessionContext } from '../../../shared/auth/types'
import { OrganizationalIndicators } from '../components/OrganizationalIndicators'
import { OrganizationalTable } from '../components/OrganizationalTable'
import { useOrganizationalIndicatorsQuery, useOrganizationalNodeQuery, useOrganizationalStructureQuery } from '../api/organizationalStructureQueries'
import type { OrganizationalKind, OrganizationalStructureQuery, OrganizationalVerificationStatus } from '../api/organizationalStructureApi'

const pageSize = 20

export function OrganizationalStructurePage({ session }: { session?: SessionContext }) {
  const [draftSearch, setDraftSearch] = useState('')
  const [query, setQuery] = useState<OrganizationalStructureQuery>({ page: 1, pageSize })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const listQuery = useOrganizationalStructureQuery(query)
  const nodeQuery = useOrganizationalNodeQuery(selectedId)
  const indicatorsQuery = useOrganizationalIndicatorsQuery(selectedId)
  const totalPages = listQuery.data ? Math.max(1, Math.ceil(listQuery.data.total / (listQuery.data.pageSize || pageSize))) : 1

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setQuery((current) => ({ ...current, page: 1, search: draftSearch.trim() || undefined }))
  }

  function changePage(nextPage: number) {
    setQuery((current) => ({ ...current, page: Math.min(Math.max(1, nextPage), totalPages) }))
  }

  const detailIndicators = indicatorsQuery.data?.indicators ?? nodeQuery.data?.indicators
  return <section className="module-page organizational-structure-page" data-testid="organizational-structure-page" aria-labelledby="organizational-structure-title">
    <header className="module-page__header"><div><p className="page-eyebrow">Gestão estadual · DITEL</p><h1 id="organizational-structure-title">Estrutura estadual</h1><p>Comandos, unidades subordinadas e inventários no escopo administrativo.</p></div></header>
    <form className="module-panel organizational-filters" onSubmit={submitFilters} aria-label="Filtros da estrutura estadual">
      <label>Buscar organização<input aria-label="Buscar organização" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Nome, sigla ou identificador" /></label>
      <label>Tipo<select value={query.kind ?? ''} onChange={(event) => setQuery((current) => ({ ...current, page: 1, kind: (event.target.value || undefined) as OrganizationalKind | undefined }))}><option value="">Todos</option><option value="intermediate_command">Comando</option><option value="bpm">BPM</option><option value="cipm">CIPM</option><option value="specialized_unit">Especializada</option></select></label>
      <label>Verificação<select value={query.verificationStatus ?? ''} onChange={(event) => setQuery((current) => ({ ...current, page: 1, verificationStatus: (event.target.value || undefined) as OrganizationalVerificationStatus | undefined }))}><option value="">Todas</option><option value="confirmed">Confirmadas</option><option value="pending">Pendentes</option><option value="divergent">Divergentes</option></select></label>
      <button className="button-link button-link--primary" type="submit">Aplicar filtros</button>
    </form>
    {listQuery.isLoading ? <LoadingState label="Carregando estrutura estadual" /> : null}
    {listQuery.isError ? <ErrorState message="Não foi possível carregar a estrutura estadual." onRetry={() => { void listQuery.refetch() }} /> : null}
    {!listQuery.isLoading && !listQuery.isError && listQuery.data?.items.length === 0 ? <EmptyState title="Nenhuma organização encontrada" description="Ajuste os filtros ou aguarde a confirmação documental da estrutura." /> : null}
    {!listQuery.isLoading && !listQuery.isError && listQuery.data ? <><OrganizationalTable items={listQuery.data.items} loading={false} onSelect={(item) => setSelectedId(item.id)} /><nav className="organizational-pagination" aria-label="Paginação da estrutura estadual"><button className="button-link" type="button" disabled={query.page === 1} onClick={() => changePage((query.page ?? 1) - 1)}>Página anterior</button><span>Página {query.page ?? 1} de {totalPages}</span><button className="button-link" type="button" aria-label="Próxima página" disabled={(query.page ?? 1) >= totalPages} onClick={() => changePage((query.page ?? 1) + 1)}>Próxima página</button></nav></> : null}
    {selectedId && nodeQuery.isError ? <ErrorState message="Não foi possível carregar os detalhes da organização." onRetry={() => { void nodeQuery.refetch() }} /> : null}
    {selectedId && detailIndicators ? <section className="module-panel organizational-detail" aria-label="Detalhes da organização"><header><div><p className="page-eyebrow">Detalhamento hierárquico</p><h2>{nodeQuery.data?.organization.name ?? indicatorsQuery.data?.scope.name}</h2></div><button type="button" className="button-link" onClick={() => setSelectedId(null)}>Fechar detalhes</button></header><OrganizationalIndicators indicators={detailIndicators} /></section> : null}
    {session?.role !== undefined && session.role !== 'ditel_admin' ? <p role="alert">Acesso administrativo obrigatório.</p> : null}
  </section>
}
