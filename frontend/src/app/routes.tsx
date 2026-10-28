import { Component, lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { authApi } from '../features/auth/api/authApi'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { PasswordChangePage } from '../features/auth/pages/PasswordChangePage'
import { changeSessionPassword, clearSession, createSession } from '../shared/auth/session'
import { can, getNavigation } from '../shared/auth/permissions'
import type { SessionContext } from '../shared/auth/types'
import { AppShell } from '../shared/ui/layout/AppShell'
import { clearProtectedQueryCache } from './providers'

const DitelDashboardPage = lazy(() => import('../features/dashboard/pages/DitelDashboardPage').then(({ DitelDashboardPage }) => ({ default: DitelDashboardPage })))
const UnitDashboardPage = lazy(() => import('../features/dashboard/pages/UnitDashboardPage').then(({ UnitDashboardPage }) => ({ default: UnitDashboardPage })))
const UnitInventoryPage = lazy(() => import('../features/inventory/pages/UnitInventoryPage').then(({ UnitInventoryPage }) => ({ default: UnitInventoryPage })))
const CallsPage = lazy(() => import('../features/calls/pages/CallsPage').then(({ CallsPage }) => ({ default: CallsPage })))
const DitelCallsPage = lazy(() => import('../features/calls/pages/DitelCallsPage').then(({ DitelCallsPage }) => ({ default: DitelCallsPage })))
const MovementsPage = lazy(() => import('../features/movements/pages/MovementsPage').then(({ MovementsPage }) => ({ default: MovementsPage })))
const ReportsPage = lazy(() => import('../features/reports/pages/ReportsPage').then(({ ReportsPage }) => ({ default: ReportsPage })))
const UnitMaintenancePage = lazy(() => import('../features/maintenance/pages/UnitMaintenancePage').then(({ UnitMaintenancePage }) => ({ default: UnitMaintenancePage })))
const DitelMaintenancePage = lazy(() => import('../features/maintenance/pages/DitelMaintenancePage').then(({ DitelMaintenancePage }) => ({ default: DitelMaintenancePage })))
const EquipmentTypesPage = lazy(() => import('../features/inventory/pages/EquipmentTypesPage').then(({ EquipmentTypesPage }) => ({ default: EquipmentTypesPage })))
const MissionsPage = lazy(() => import('../features/missions/pages/MissionsPage').then(({ MissionsPage }) => ({ default: MissionsPage })))
const DitelMissionsPage = lazy(() => import('../features/missions/pages/DitelMissionsPage').then(({ DitelMissionsPage }) => ({ default: DitelMissionsPage })))
const AuditPage = lazy(() => import('../features/audit/pages/AuditPage').then(({ AuditPage }) => ({ default: AuditPage })))
const AdministrationPage = lazy(() => import('../features/administration/pages/AdministrationPage').then(({ AdministrationPage }) => ({ default: AdministrationPage })))
const AcMaterialsPage = lazy(() => import('../features/ac/pages/AcMaterialsPage').then(({ AcMaterialsPage }) => ({ default: AcMaterialsPage })))
const AcTransfersPage = lazy(() => import('../features/ac/pages/AcTransfersPage').then(({ AcTransfersPage }) => ({ default: AcTransfersPage })))
const AcReportsPage = lazy(() => import('../features/ac/pages/AcReportsPage').then(({ AcReportsPage }) => ({ default: AcReportsPage })))
const OrganizationalStructurePage = lazy(() => import('../features/organizationalStructure/pages/OrganizationalStructurePage').then(({ OrganizationalStructurePage }) => ({ default: OrganizationalStructurePage })))

type AppRoutesProps = {
  session: SessionContext | null
  onSessionChange: (session: SessionContext | null) => void
}

const routePermissions: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/inventario': 'inventory',
  '/chamados': 'tickets',
  '/movimentacoes': 'movements',
  '/relatorios': 'reports',
  '/administracao': 'administration',
  '/auditoria': 'administration',
  '/tipos-equipamento': 'administration',
  '/manutencao': 'maintenance',
  '/missoes-tecnicas': 'missions',
  '/ac/materiais': 'ac_materials',
  '/ac/transferencias': 'ac_transfers',
  '/ac/relatorios': 'ac_reports',
  '/estrutura-estadual': 'statewide_structure',
}

let ignoreNextLoginDestination = false

export function initialRouteFor(session: SessionContext): string {
  return session.role === 'ac_operator' ? '/ac/materiais' : '/dashboard'
}

export function resolveInitialRoute(session: SessionContext, requestedPath?: string): string {
  if (typeof requestedPath === 'string' && requestedPath.startsWith('/') && !requestedPath.startsWith('//')) {
    const pathname = requestedPath.split(/[?#]/, 1)[0]
    const permission = routePermissions[pathname]
    if (permission && can(session, permission)) return requestedPath
  }

  return initialRouteFor(session)
}

function PermissionState() {
  return <section aria-live="polite"><h1>Acesso não autorizado</h1><p>Seu perfil não possui permissão para acessar este módulo.</p></section>
}

function RouteLoadingState() {
  return <main aria-busy="true" aria-live="polite"><h1>Carregando módulo</h1><p>Preparando o conteúdo solicitado…</p></main>
}

type RouteChunkBoundaryProps = { children: ReactNode }
type RouteChunkBoundaryState = { hasError: boolean }

class RouteChunkBoundary extends Component<RouteChunkBoundaryProps, RouteChunkBoundaryState> {
  state: RouteChunkBoundaryState = { hasError: false }

  static getDerivedStateFromError(): RouteChunkBoundaryState {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return <section role="alert" aria-live="assertive"><h1>Não foi possível carregar este módulo</h1><p>Atualize a página para tentar novamente.</p><button type="button" onClick={() => window.location.reload()}>Atualizar página</button></section>
    }
    return this.props.children
  }
}

function LazyRoute({ children }: RouteChunkBoundaryProps) {
  return <RouteChunkBoundary><Suspense fallback={<RouteLoadingState />}>{children}</Suspense></RouteChunkBoundary>
}

function ProtectedRoutes({ session, onSessionChange }: { session: SessionContext; onSessionChange: (session: SessionContext | null) => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const permission = routePermissions[location.pathname]

  async function logout() {
    try {
      await authApi.signOut()
    } catch {
      // Local cleanup still protects this browser if the server is unavailable.
    } finally {
      clearProtectedQueryCache()
      clearSession()
      ignoreNextLoginDestination = true
      navigate('/login', { replace: true })
      onSessionChange(null)
    }
  }

  async function changePassword(newPassword: string) {
    clearProtectedQueryCache()
    const updatedSession = await changeSessionPassword(authApi, newPassword)
    onSessionChange(updatedSession)
    navigate(initialRouteFor(updatedSession), { replace: true })
  }

  if (session.mustChangePassword) {
    return <PasswordChangePage userName={session.name} onChangePassword={changePassword} onLogout={logout} />
  }

  const content = permission && !can(session, permission)
    ? <PermissionState />
    : <Routes>
        <Route path="/dashboard" element={<LazyRoute>{session.role === 'ditel_admin' ? <DitelDashboardPage /> : <UnitDashboardPage session={session} />}</LazyRoute>} />
        <Route path="/inventario" element={<LazyRoute><UnitInventoryPage session={session} /></LazyRoute>} />
        <Route path="/chamados" element={<LazyRoute>{session.role === 'ditel_admin' ? <DitelCallsPage /> : <CallsPage />}</LazyRoute>} />
        <Route path="/movimentacoes" element={<LazyRoute><MovementsPage session={session} /></LazyRoute>} />
        <Route path="/relatorios" element={<LazyRoute><ReportsPage session={session} /></LazyRoute>} />
        <Route path="/manutencao" element={<LazyRoute>{session.role === 'ditel_admin' ? <DitelMaintenancePage session={session} /> : <UnitMaintenancePage session={session} />}</LazyRoute>} />
        <Route path="/missoes-tecnicas" element={<LazyRoute>{session.role === 'ditel_admin' ? <DitelMissionsPage session={session} /> : <MissionsPage session={session} />}</LazyRoute>} />
        <Route path="/tipos-equipamento" element={<LazyRoute><EquipmentTypesPage session={session} /></LazyRoute>} />
        <Route path="/auditoria" element={<LazyRoute><AuditPage session={session} /></LazyRoute>} />
        <Route path="/administracao" element={<LazyRoute><AdministrationPage /></LazyRoute>} />
        <Route path="/ac/materiais" element={<LazyRoute><AcMaterialsPage session={session} /></LazyRoute>} />
        <Route path="/ac/transferencias" element={<LazyRoute><AcTransfersPage session={session} /></LazyRoute>} />
        <Route path="/ac/relatorios" element={<LazyRoute><AcReportsPage session={session} /></LazyRoute>} />
        <Route path="/estrutura-estadual" element={<LazyRoute><OrganizationalStructurePage session={session} /></LazyRoute>} />
        <Route path="*" element={<Navigate to={initialRouteFor(session)} replace />} />
      </Routes>

  return (
    <AppShell
      context={{
        unitName: session.unit?.name ?? 'DITEL',
        roleLabel: session.role === 'ditel_admin' ? 'Administração estadual' : session.role === 'ac_operator' ? 'Operador AC' : 'Usuário da unidade',
        scopeLabel: session.unit ? `Escopo ${session.unit.acronym}` : session.role === 'ac_operator' ? 'Custódia AC' : 'Escopo estadual',
        userName: session.name,
      }}
      navigation={getNavigation(session)}
      activePath={location.pathname}
      onLogout={logout}
    >
      {content}
    </AppShell>
  )
}

function LoginRoute({ onSessionChange }: Pick<AppRoutesProps, 'onSessionChange'>) {
  const location = useLocation()
  const navigate = useNavigate()

  async function login(registration: string, password: string) {
    clearProtectedQueryCache()
    const session = await createSession(authApi, registration, password)
    if (session) {
      onSessionChange(session)
      const shouldIgnoreDestination = ignoreNextLoginDestination
      ignoreNextLoginDestination = false
      const state = location.state as { from?: unknown } | null
      navigate(resolveInitialRoute(session, shouldIgnoreDestination ? undefined : typeof state?.from === 'string' ? state.from : undefined), { replace: true })
    }
    return session
  }

  return <LoginPage onLogin={login} />
}

export function AppRoutes({ session, onSessionChange }: AppRoutesProps) {
  const location = useLocation()
  const loginState = location.state as { from?: unknown; loggedOut?: boolean } | null
  const requestedPath = ignoreNextLoginDestination ? undefined : typeof loginState?.from === 'string' ? loginState.from : undefined
  const isLogoutTransition = ignoreNextLoginDestination || loginState?.loggedOut === true

  return (
    <Routes>
      <Route index element={session ? <Navigate to={initialRouteFor(session)} replace /> : <Navigate to="/login" replace />} />
      <Route path="/login" element={session && !isLogoutTransition ? <Navigate to={resolveInitialRoute(session, requestedPath)} replace /> : <LoginRoute onSessionChange={onSessionChange} />} />
      <Route path="*" element={session ? <ProtectedRoutes session={session} onSessionChange={onSessionChange} /> : <Navigate to="/login" replace state={ignoreNextLoginDestination ? { loggedOut: true } : { from: `${location.pathname}${location.search}` }} />} />
    </Routes>
  )
}
