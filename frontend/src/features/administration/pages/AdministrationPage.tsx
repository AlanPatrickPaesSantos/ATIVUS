import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../../../shared/ui/overlays/Modal'
import { ApiError } from '../../../shared/api/errors'
import { getSession } from '../../../shared/auth/session'
import { createAdminUser, deleteAdminUser, getAdminUsers, updateAdminUser, updateAdminUserSituation, type AdminUserMutableSituation } from '../api/administrationApi'
import { adaptAdminUser, toAdminUserCreateRequest, toAdminUserUpdateRequest, type AdminUser, type AdminUserDraft, type AdminUserEditDraft } from '../adapters/administrationAdapter'
import { getUnits, type UnitOption } from '../../movements/api/unitsApi'
import { UnitInventoryPanel, UnitCallsPanel, UnitUsersPanel, UnitHistoryPanel, UserAuditPanel } from '../components/AdministrationPanels'

const PAGE_SIZE = 20
type AdministrativeUnit = UnitOption & { coverage?: string; equipment?: number; attention?: number }
type UserDetailTab = 'institutional' | 'access' | 'unit' | 'history' | 'audit'
type UnitDetailTab = 'summary' | 'inventory' | 'calls' | 'users' | 'history'

const userDetailTabs: Array<{ value: UserDetailTab; label: string }> = [
  { value: 'institutional', label: 'Dados institucionais' }, { value: 'access', label: 'Acesso e perfil' },
  { value: 'unit', label: 'Unidade vinculada' }, { value: 'history', label: 'Histórico' }, { value: 'audit', label: 'Atividade e auditoria' },
]
const unitDetailTabs: Array<{ value: UnitDetailTab; label: string }> = [
  { value: 'summary', label: 'Resumo' }, { value: 'inventory', label: 'Inventário' }, { value: 'calls', label: 'Chamados' }, { value: 'users', label: 'Usuários' }, { value: 'history', label: 'Histórico administrativo' },
]

const emptyAdminUserDraft: AdminUserDraft = { name: '', registration: '', role: 'unit_user', password: '', unit: null }

function editDraftFromUser(user: AdminUser): AdminUserEditDraft {
  return { name: user.name, registration: user.registration, role: user.role, unit: user.unitReference, updatedAt: user.updatedAtToken }
}

function CreateUserForm({ units, onClose, onCreated }: { units: UnitOption[]; onClose: () => void; onCreated: (draft: AdminUserDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<AdminUserDraft>(emptyAdminUserDraft)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedUnit = draft.unit?.id ?? ''

  const submit = async () => {
    const name = draft.name.trim()
    const registration = draft.registration.trim()
    if (!name || !registration || !draft.password) { setError('Preencha nome, matrícula e senha inicial.'); return }
    if (draft.role === 'unit_user' && !draft.unit) { setError('Selecione uma unidade para usuários de unidade.'); return }
    setSubmitting(true); setError(null)
    try { await onCreated({ ...draft, name, registration }); } catch (caught: unknown) { setError(caught instanceof Error ? caught.message : 'Não foi possível cadastrar o usuário.') } finally { setSubmitting(false) }
  }

  return <form className="administration-create" onSubmit={(event) => { event.preventDefault(); void submit() }}>
    <p>Informe os dados institucionais e a senha inicial. A senha será protegida pelo servidor.</p>
    {error && <div role="alert">{error}</div>}
    <label>Nome completo<input autoFocus value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
    <label>Matrícula<input value={draft.registration} onChange={(event) => setDraft((current) => ({ ...current, registration: event.target.value }))} /></label>
    <label>Perfil de acesso<select value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as AdminUserDraft['role'], unit: event.target.value === 'unit_user' ? current.unit : null }))}><option value="unit_user">Usuário de unidade</option><option value="ditel_admin">Administrador DITEL</option></select></label>
    <label>Senha inicial<input type="password" autoComplete="new-password" value={draft.password} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} /></label>
    {draft.role === 'unit_user' && <label>Unidade<select aria-label="Unidade" value={selectedUnit} onChange={(event) => setDraft((current) => ({ ...current, unit: units.find((unit) => unit.id === event.target.value) ?? null }))}><option value="">Selecione uma unidade</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>}
    <footer><button className="button-link" type="button" disabled={submitting} onClick={onClose}>Cancelar</button><button className="button-link button-link--primary" type="submit" disabled={submitting}>{submitting ? 'Salvando...' : error ? 'Tentar novamente' : 'Criar usuário'}</button></footer>
  </form>
}

function EditUserForm({ user, units, onClose, onUpdated, onRefreshCurrent }: { user: AdminUser; units: UnitOption[]; onClose: () => void; onUpdated: (draft: AdminUserEditDraft) => Promise<void>; onRefreshCurrent: (userId: string) => Promise<AdminUser | null> }) {
  const [draft, setDraft] = useState<AdminUserEditDraft>(() => editDraftFromUser(user))
  const [submitting, setSubmitting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const selectedUnit = draft.unit?.id ?? ''

  const submit = async () => {
    const name = draft.name.trim()
    const registration = draft.registration.trim()
    if (!name || !registration) { setError('Preencha nome e matrícula.'); return }
    if (draft.role === 'unit_user' && !draft.unit) { setError('Selecione uma unidade para usuários de unidade.'); return }
    setSubmitting(true); setError(null); setRefreshMessage(null)
    try { await onUpdated({ ...draft, name, registration }); } catch (caught: unknown) { setError(caught instanceof Error ? caught.message : 'Não foi possível atualizar o usuário.'); setConflict(caught instanceof ApiError && caught.code === 'USER_CONFLICT') } finally { setSubmitting(false) }
  }

  const refreshCurrent = async () => {
    setRefreshing(true); setError(null); setRefreshMessage(null)
    try {
      const current = await onRefreshCurrent(user.id)
      if (!current) {
        setError('Não foi possível encontrar o usuário nos filtros atuais. Ajuste os filtros e tente novamente.')
        setConflict(true)
        return
      }
      setDraft((currentDraft) => ({ ...currentDraft, updatedAt: current.updatedAtToken }))
      setConflict(false)
      setRefreshMessage('Dados atuais recarregados. Seu rascunho foi preservado.')
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível recarregar os dados atuais.')
      setConflict(true)
    } finally {
      setRefreshing(false)
    }
  }

  return <form className="administration-create" onSubmit={(event) => { event.preventDefault(); void submit() }}>
    <p>Atualize dados cadastrais e perfil. A situação de acesso permanece no fluxo próprio de bloqueio/desbloqueio.</p>
    {error && <div role="alert">{error}</div>}
    {refreshMessage && <p>{refreshMessage}</p>}
    <label>Nome completo<input autoFocus value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
    <label>Matrícula<input value={draft.registration} onChange={(event) => setDraft((current) => ({ ...current, registration: event.target.value }))} /></label>
    <label>Perfil de acesso<select value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as AdminUserEditDraft['role'], unit: event.target.value === 'unit_user' ? current.unit : null }))}><option value="unit_user">Usuário de unidade</option><option value="ditel_admin">Administrador DITEL</option></select></label>
    {draft.role === 'unit_user' && <label>Unidade<select aria-label="Unidade" value={selectedUnit} onChange={(event) => setDraft((current) => ({ ...current, unit: units.find((unit) => unit.id === event.target.value) ?? null }))}><option value="">Selecione uma unidade</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>}
    <footer><button className="button-link" type="button" disabled={submitting || refreshing} onClick={onClose}>Cancelar</button>{conflict && <button className="button-link" type="button" disabled={submitting || refreshing} onClick={() => { void refreshCurrent() }}>{refreshing ? 'Recarregando...' : 'Recarregar dados atuais'}</button>}<button className="button-link button-link--primary" type="submit" disabled={submitting || refreshing}>{submitting ? 'Salvando...' : error && !conflict ? 'Tentar novamente' : 'Salvar alterações'}</button></footer>
  </form>
}

function UserDetail({ user, tab, onTabChange, onClose, onEdit, onSituationChange, onDelete, currentUserId }: { user: AdminUser; tab: UserDetailTab; onTabChange: (tab: UserDetailTab) => void; onClose: () => void; onEdit: (user: AdminUser) => void; onSituationChange: (user: AdminUser, situation: AdminUserMutableSituation) => Promise<void>; onDelete: (user: AdminUser) => Promise<void>; currentUserId?: string }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirming, setDeleteConfirming] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const targetSituation: AdminUserMutableSituation | null = user.status === 'Ativo' ? 'blocked' : user.status === 'Bloqueado' ? 'active' : null
  const actionLabel = targetSituation === 'blocked' ? 'Bloquear usuário' : 'Desbloquear usuário'
  const confirmationLabel = targetSituation === 'blocked' ? 'bloqueio' : 'desbloqueio'
  const isOwnUser = currentUserId === user.id
  const canDelete = user.status !== 'Inativo' && !isOwnUser
  const submitSituationChange = async () => {
    if (!targetSituation) return
    setUpdating(true); setUpdateError(null)
    try { await onSituationChange(user, targetSituation); setConfirming(false) } catch (caught: unknown) { setUpdateError(caught instanceof Error ? caught.message : 'Não foi possível atualizar a situação.') } finally { setUpdating(false) }
  }
  const submitDelete = async () => {
    setDeleting(true); setDeleteError(null)
    try { await onDelete(user); setDeleteConfirming(false) } catch (caught: unknown) { setDeleteError(caught instanceof Error ? caught.message : 'Não foi possível excluir o usuário.') } finally { setDeleting(false) }
  }
  return <div className="administration-detail">
    <header><div><p className="page-eyebrow">Matrícula {user.registration}</p><h3>{user.name}</h3></div><span>{user.status}</span></header>
    <div className="administration-detail__tabs" role="tablist" aria-label="Detalhes do usuário">{userDetailTabs.map((item) => <button key={item.value} id={`user-detail-tab-${item.value}`} type="button" role="tab" aria-selected={tab === item.value} aria-controls="user-detail-panel" onClick={() => onTabChange(item.value)}>{item.label}</button>)}</div>
    <div id="user-detail-panel" role="tabpanel" aria-labelledby={`user-detail-tab-${tab}`}>
      {tab === 'institutional' && <section className="administration-detail__grid"><section><h4>Dados institucionais</h4><dl><div><dt>Nome completo</dt><dd>{user.name}</dd></div><div><dt>Matrícula</dt><dd>{user.registration}</dd></div><div><dt>Última atualização</dt><dd>{user.updatedAt}</dd></div></dl></section><section><h4>Situação cadastral</h4><p>{user.status}</p></section></section>}
      {tab === 'access' && <section className="administration-detail__grid"><section><h4>Acesso e perfil</h4><dl><div><dt>Perfil de acesso</dt><dd>{user.profile}</dd></div><div><dt>Situação de acesso</dt><dd>{user.status}</dd></div></dl></section><section><h4>Escopo</h4><p>{user.unit === 'DITEL' ? 'Escopo estadual' : `Unidade ${user.unit}`}</p></section></section>}
      {tab === 'unit' && <section className="administration-detail__grid"><section><h4>Unidade vinculada</h4><dl><div><dt>Unidade</dt><dd>{user.unit}</dd></div></dl></section><section><h4>Regra de vínculo</h4><p>O vínculo exibido é somente para consulta administrativa.</p></section></section>}
      {tab === 'history' && <section className="administration-detail__history"><h4>Histórico administrativo</h4><UserAuditPanel userId={user.id} /></section>}
      {tab === 'audit' && <section className="administration-detail__history"><h4>Atividade e auditoria</h4><UserAuditPanel userId={user.id} /></section>}
    </div>
    {targetSituation && !confirming && <section className="administration-detail__action"><p>Atualize a situação de acesso somente após confirmar a operação.</p><button className="button-link button-link--danger" type="button" onClick={() => { setUpdateError(null); setConfirming(true) }}>{actionLabel}</button></section>}
    {targetSituation && confirming && <section className="administration-detail__confirmation" aria-label={`Confirmação de ${confirmationLabel}`}><p>Confirmar {confirmationLabel} de {user.name}?</p>{updateError && <div role="alert">{updateError}</div>}<div className="administration-detail__confirmation-actions"><button className="button-link button-link--danger" type="button" disabled={updating} onClick={() => { void submitSituationChange() }}>{updating ? 'Salvando...' : updateError ? 'Tentar novamente' : `Confirmar ${confirmationLabel}`}</button><button className="button-link" type="button" disabled={updating} onClick={() => { setConfirming(false); setUpdateError(null) }}>Cancelar</button></div></section>}
    {canDelete && !deleteConfirming && <section className="administration-detail__action"><p>Para remover o usuário permanentemente, use a exclusão segura (inativação lógica).</p><button className="button-link button-link--danger" type="button" onClick={() => { setDeleteError(null); setDeleteConfirming(true) }}>Excluir usuário</button></section>}
    {canDelete && deleteConfirming && <section className="administration-detail__confirmation" aria-label="Confirmação de exclusão"><p>Confirmar exclusão de {user.name}? Esta ação não pode ser desfeita — o usuário será inativado.</p>{deleteError && <div role="alert">{deleteError}</div>}<div className="administration-detail__confirmation-actions"><button className="button-link button-link--danger" type="button" disabled={deleting} onClick={() => { void submitDelete() }}>{deleting ? 'Excluindo...' : deleteError ? 'Tentar novamente' : 'Confirmar exclusão'}</button><button className="button-link" type="button" disabled={deleting} onClick={() => { setDeleteConfirming(false); setDeleteError(null) }}>Cancelar</button></div></section>}
    <footer><button className="button-link button-link--primary" type="button" onClick={() => onEdit(user)}>Editar usuário</button><button className="button-link" type="button" onClick={onClose}>Fechar</button></footer>
  </div>
}

function unitCoverage(unit: AdministrativeUnit) { return unit.coverage ?? 'Não informado' }
function unitEquipment(unit: AdministrativeUnit) { return unit.equipment?.toLocaleString('pt-BR') ?? 'Não informado' }
function unitAttention(unit: AdministrativeUnit) { return unit.attention?.toLocaleString('pt-BR') ?? 'Não informado' }

function UnitDetail({ unit, tab, onTabChange, onClose }: { unit: AdministrativeUnit; tab: UnitDetailTab; onTabChange: (tab: UnitDetailTab) => void; onClose: () => void }) {
  return <div className="administration-detail">
    <header><div><p className="page-eyebrow">Estrutura operacional</p><h3>{unit.name}</h3></div><span>{unit.acronym}</span></header>
    <div className="administration-detail__tabs" role="tablist" aria-label="Detalhes da unidade">{unitDetailTabs.map((item) => <button key={item.value} id={`unit-detail-tab-${item.value}`} type="button" role="tab" aria-selected={tab === item.value} aria-controls="unit-detail-panel" onClick={() => onTabChange(item.value)}>{item.label}</button>)}</div>
    <div id="unit-detail-panel" role="tabpanel" aria-labelledby={`unit-detail-tab-${tab}`}>
      {tab === 'summary' && <section className="administration-detail__grid"><section><h4>Resumo operacional</h4><dl><div><dt>Cobertura do inventário</dt><dd>{unitCoverage(unit)}</dd></div><div><dt>Equipamentos</dt><dd>{unitEquipment(unit)}</dd></div><div><dt>Pendências</dt><dd>{unitAttention(unit)}</dd></div></dl></section><section><h4>Situação</h4><p>Unidade monitorada no escopo estadual.</p></section></section>}
      {tab === 'inventory' && <section className="administration-detail__history"><h4>Inventário</h4><UnitInventoryPanel unitId={unit.id} /></section>}
      {tab === 'calls' && <section className="administration-detail__history"><h4>Chamados</h4><UnitCallsPanel unitId={unit.id} /></section>}
      {tab === 'users' && <section className="administration-detail__history"><h4>Usuários vinculados</h4><UnitUsersPanel unitId={unit.id} /></section>}
      {tab === 'history' && <section className="administration-detail__history"><h4>Histórico administrativo</h4><UnitHistoryPanel unitId={unit.id} /></section>}
    </div>
    <footer><button className="button-link" type="button" onClick={onClose}>Fechar</button></footer>
  </div>
}

export function AdministrationPage() {
  const [tab, setTab] = useState<'users' | 'units'>('users')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [units, setUnits] = useState<AdministrativeUnit[]>([])
  const [unitsLoading, setUnitsLoading] = useState(true)
  const [unitsError, setUnitsError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [profile, setProfile] = useState('all')
  const [unit, setUnit] = useState('all')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<AdminUser | null>(null)
  const [selectedUserTab, setSelectedUserTab] = useState<UserDetailTab>('institutional')
  const [selectedUnit, setSelectedUnit] = useState<AdministrativeUnit | null>(null)
  const [selectedUnitTab, setSelectedUnitTab] = useState<UnitDetailTab>('summary')
  const [mutationMessage, setMutationMessage] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [pendingRefreshMessage, setPendingRefreshMessage] = useState<string | null>(null)

  const load = async (): Promise<AdminUser[] | null> => {
    setLoading(true); setError(null)
    try { const response = await getAdminUsers({ page, pageSize: PAGE_SIZE, search: search.trim() || undefined, role: profile === 'Administrador DITEL' ? 'ditel_admin' : profile === 'Usuário de unidade' ? 'unit_user' : undefined, unitId: unit === 'all' ? undefined : unit, situation: status === 'all' ? undefined : status as 'Ativo' | 'Bloqueado' | 'Inativo' }); const adapted = response.items.map(adaptAdminUser); setUsers(adapted); setTotal(response.total); return adapted } catch (caught: unknown) { setError(caught instanceof Error ? caught.message : 'Erro desconhecido'); return null } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [page, search, profile, unit, status])
  const loadUnits = async () => {
    setUnitsLoading(true); setUnitsError(null)
    try { const response = await getUnits(); setUnits(response.items) } catch { setUnits([]); setUnitsError('Não foi possível carregar unidades. Tente novamente.') } finally { setUnitsLoading(false) }
  }
  useEffect(() => { void loadUnits() }, [])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const resetPage = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(1) }
  const openUserDetails = (user: AdminUser) => { setSelectedUserTab('institutional'); setSelected(user) }
  const openUnitDetails = (unit: AdministrativeUnit) => { setSelectedUnitTab('summary'); setSelectedUnit(unit) }
  const retryList = async () => { const refreshed = await load(); if (refreshed && pendingRefreshMessage) { setMutationMessage(pendingRefreshMessage); setPendingRefreshMessage(null) } }
  const changeSituation = async (user: AdminUser, situation: AdminUserMutableSituation) => { await updateAdminUserSituation(user.id, situation); setSelected(null); await load(); setMutationMessage(`${user.name} ${situation === 'blocked' ? 'bloqueado' : 'desbloqueado'} com sucesso.`) }
  const deleteUser = async (user: AdminUser) => { await deleteAdminUser(user.id); setSelected(null); const successMessage = `Usuário ${user.name} excluído (inativado) com sucesso.`; const refreshed = await load(); if (refreshed) { setPendingRefreshMessage(null); setMutationMessage(successMessage) } else { setPendingRefreshMessage(successMessage); setError(`Usuário ${user.name} excluído, mas a lista não foi atualizada.`); setMutationMessage(successMessage) } }
  const createUser = async (draft: AdminUserDraft) => { await createAdminUser(toAdminUserCreateRequest(draft)); setCreateOpen(false); const successMessage = `Usuário ${draft.name} cadastrado com sucesso.`; const refreshed = await load(); if (refreshed) { setPendingRefreshMessage(null); setMutationMessage(successMessage) } else { setPendingRefreshMessage(successMessage); setError(`Usuário ${draft.name} cadastrado, mas a lista não foi atualizada.`); setMutationMessage(`Usuário ${draft.name} cadastrado, mas a lista não foi atualizada.`) } }
  const editUser = async (draft: AdminUserEditDraft) => { if (!editing) return; await updateAdminUser(editing.id, toAdminUserUpdateRequest(draft)); setEditing(null); setSelected(null); const successMessage = `Usuário ${draft.name} atualizado com sucesso.`; const refreshed = await load(); if (refreshed) { setPendingRefreshMessage(null); setMutationMessage(successMessage) } else { setPendingRefreshMessage(successMessage); setError(`Usuário ${draft.name} atualizado, mas a lista não foi atualizada.`); setMutationMessage(`Usuário ${draft.name} atualizado, mas a lista não foi atualizada.`) } }
  const refreshEditingUser = async (userId: string) => { const refreshed = await load(); const current = refreshed?.find((user) => user.id === userId) ?? null; if (current) setEditing(current); return current }

  return <section className="module-page administration-page" data-testid="ditel-administration-console" data-visual-variant="statewide-governance-console" aria-labelledby="administration-title">
    <header className="module-page__header"><div><p className="page-eyebrow">Governança patrimonial · escopo estadual</p><h1 id="administration-title">Administração DITEL</h1><p>Gerencie o acesso institucional e acompanhe as Unidades vinculadas ao SIGAT.</p></div><button className="button-link button-link--primary" type="button" onClick={() => { setCreateOpen(true); setMutationMessage(null) }}>Cadastrar usuário</button></header>
    <div className="administration-page__notice" role="status">{loading ? 'Carregando usuários...' : mutationMessage ?? 'Ambiente de consulta administrativa.'}</div>
    <div className="administration-page__tabs" role="tablist" aria-label="Áreas administrativas"><button type="button" role="tab" aria-selected={tab === 'users'} onClick={() => setTab('users')}>Usuários</button><button type="button" role="tab" aria-selected={tab === 'units'} onClick={() => setTab('units')}>Unidades</button></div>
    {tab === 'users' ? <section className="module-panel administration-page__workspace" aria-labelledby="users-title"><header><div><p className="page-eyebrow">Acesso institucional</p><h2 id="users-title">Usuários vinculados</h2><p>Consulte perfil, Unidade de vínculo e situação de acesso.</p></div><strong>{total} {total === 1 ? 'registro' : 'registros'}</strong></header>{error && <div role="alert"><p>{error}</p><button type="button" onClick={retryList}>Tentar novamente</button></div>}<div className="administration-page__filters"><label>Buscar usuário<input type="search" aria-label="Buscar usuário" value={search} onChange={(e) => resetPage(setSearch)(e.target.value)} placeholder="Nome ou matrícula" /></label><label>Perfil<select aria-label="Filtrar usuários por perfil" value={profile} onChange={(e) => resetPage(setProfile)(e.target.value)}><option value="all">Todos os perfis</option><option>Administrador DITEL</option><option>Usuário de unidade</option></select></label><label>Unidade<select aria-label="Filtrar usuários por unidade" value={unit} onChange={(e) => resetPage(setUnit)(e.target.value)}><option value="all">Todas as unidades</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Situação<select aria-label="Filtrar usuários por situação" value={status} onChange={(e) => resetPage(setStatus)(e.target.value)}><option value="all">Todas as situações</option><option>Ativo</option><option>Bloqueado</option><option>Inativo</option></select></label></div><div className="administration-page__table" role="table" aria-label="Usuários DITEL"><div className="administration-page__table-header" role="row"><span role="columnheader">Usuário</span><span role="columnheader">Perfil</span><span role="columnheader">Unidade</span><span role="columnheader">Situação</span><span role="columnheader"><span className="sr-only">Ações</span></span></div>{users.map((user) => <div role="row" key={user.id}><div role="cell"><strong>{user.name}</strong><small>Matrícula {user.registration}</small></div><span role="cell">{user.profile}</span><span role="cell">{user.unit}</span><span role="cell">{user.status}</span><span role="cell"><button type="button" className="button-link button-link--quiet" aria-label={`Ver detalhes de ${user.name}`} onClick={() => openUserDetails(user)}>Detalhes</button></span></div>)}{!loading && !error && !users.length && <p className="administration-page__empty">Nenhum usuário encontrado para os filtros informados.</p>}</div><nav className="administration-page__pagination" aria-label="Paginação de usuários"><button type="button" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><span>Página {page} de {totalPages}</span><button type="button" aria-label="Próxima página" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Próxima</button></nav></section> : <section className="module-panel administration-page__workspace" aria-labelledby="units-title"><header><div><p className="page-eyebrow">Estrutura operacional</p><h2 id="units-title">Unidades cadastradas</h2><p>Visualize cobertura, inventário e pendências por Unidade.</p></div><strong>{units.length} {units.length === 1 ? 'unidade' : 'unidades'}</strong></header>{unitsError && <div role="alert"><p>{unitsError}</p><button type="button" onClick={() => { void loadUnits() }}>Tentar carregar unidades novamente</button></div>}{unitsLoading ? <p className="administration-page__empty">Carregando unidades...</p> : !unitsError && !units.length ? <p className="administration-page__empty">Nenhuma unidade cadastrada foi encontrada.</p> : !unitsError && <div className="administration-page__table administration-page__table--units" role="table" aria-label="Unidades DITEL"><div className="administration-page__table-header" role="row"><span role="columnheader">Unidade</span><span role="columnheader">Cobertura</span><span role="columnheader">Equipamentos</span><span role="columnheader">Atenção</span><span role="columnheader"><span className="sr-only">Ações</span></span></div>{units.map((item) => <div role="row" key={item.id}><strong role="cell">{item.name}</strong><span role="cell">{unitCoverage(item)}</span><span role="cell">{unitEquipment(item)}</span><span role="cell">{unitAttention(item)}</span><span role="cell"><button type="button" className="button-link button-link--quiet" aria-label={`Ver detalhes de ${item.name}`} onClick={() => openUnitDetails(item)}>Detalhes</button></span></div>)}</div>}</section>}
    <aside className="module-panel administration-page__actions"><h2>Filas administrativas</h2><p>Usuários e eventos de auditoria são registrados pelo backend; use os atalhos para acompanhar inventário e chamados.</p><Link className="button-link button-link--primary" to="/inventario">Consultar inventário estadual</Link><Link className="button-link" to="/chamados">Revisar chamados críticos</Link></aside>
    <Modal open={Boolean(selected)} title="Detalhes do usuário" ariaLabel="Detalhes do usuário" size="lg" onClose={() => setSelected(null)}>{selected && <UserDetail key={selected.id} user={selected} tab={selectedUserTab} onTabChange={setSelectedUserTab} onClose={() => setSelected(null)} onEdit={(user) => { setEditing(user); setSelected(null); setMutationMessage(null) }} onSituationChange={changeSituation} onDelete={deleteUser} currentUserId={getSession()?.userId} />}</Modal>
    <Modal open={Boolean(selectedUnit)} title="Detalhes da unidade" ariaLabel="Detalhes da unidade" size="lg" onClose={() => setSelectedUnit(null)}>{selectedUnit && <UnitDetail unit={selectedUnit} tab={selectedUnitTab} onTabChange={setSelectedUnitTab} onClose={() => setSelectedUnit(null)} />}</Modal>
    <Modal open={createOpen} title="Cadastrar usuário" ariaLabel="Cadastrar usuário" size="md" onClose={() => setCreateOpen(false)}><CreateUserForm units={units} onClose={() => setCreateOpen(false)} onCreated={createUser} /></Modal>
    <Modal open={Boolean(editing)} title="Editar usuário" ariaLabel="Editar usuário" size="md" onClose={() => setEditing(null)}>{editing && <EditUserForm user={editing} units={units} onClose={() => setEditing(null)} onUpdated={editUser} onRefreshCurrent={refreshEditingUser} />}</Modal>
  </section>
}
