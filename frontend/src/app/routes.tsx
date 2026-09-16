import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { authApi } from '../features/auth/api/authApi'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { PasswordChangePage } from '../features/auth/pages/PasswordChangePage'
import { DitelDashboardPage } from '../features/dashboard/pages/DitelDashboardPage'
import { UnitDashboardPage } from '../features/dashboard/pages/UnitDashboardPage'
import { UnitInventoryPage } from '../features/inventory/pages/UnitInventoryPage'
import { CallsPage } from '../features/calls/pages/CallsPage'
import { DitelCallsPage } from '../features/calls/pages/DitelCallsPage'
import { MovementsPage } from '../features/movements/pages/MovementsPage'
import { ReportsPage } from '../features/reports/pages/ReportsPage'
import { UnitMaintenancePage } from '../features/maintenance/pages/UnitMaintenancePage'
import { DitelMaintenancePage } from '../features/maintenance/pages/DitelMaintenancePage'
import { EquipmentTypesPage } from '../features/inventory/pages/EquipmentTypesPage'
import { MissionsPage } from '../features/missions/pages/MissionsPage'
import { DitelMissionsPage } from '../features/missions/pages/DitelMissionsPage'
import { AuditPage } from '../features/audit/pages/AuditPage'
import { AdministrationPage } from '../features/administration/pages/AdministrationPage'
import { changeSessionPassword, clearSession, createSession } from '../shared/auth/session'
import { can, getNavigation } from '../shared/auth/permissions'
import type { SessionContext } from '../shared/auth/types'
import { AppShell } from '../shared/ui/layout/AppShell'
import { clearProtectedQueryCache } from './providers'

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
}

function PermissionState() {
  return <section aria-live="polite"><h1>Acesso não autorizado</h1><p>Seu perfil não possui permissão para acessar este módulo.</p></section>
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
      onSessionChange(null)
      navigate('/login', { replace: true })
    }
  }

  async function changePassword(newPassword: string) {
    clearProtectedQueryCache()
    const updatedSession = await changeSessionPassword(authApi, newPassword)
    onSessionChange(updatedSession)
    navigate('/dashboard', { replace: true })
  }

  if (session.mustChangePassword) {
    return <PasswordChangePage userName={session.name} onChangePassword={changePassword} onLogout={logout} />
  }

  const content = permission && !can(session, permission)
    ? <PermissionState />
    : <Routes>
        <Route path="/dashboard" element={session.role === 'ditel_admin' ? <DitelDashboardPage /> : <UnitDashboardPage session={session} />} />
        <Route path="/inventario" element={<UnitInventoryPage session={session} />} />
        <Route path="/chamados" element={session.role === 'ditel_admin' ? <DitelCallsPage /> : <CallsPage />} />
        <Route path="/movimentacoes" element={<MovementsPage session={session} />} />
        <Route path="/relatorios" element={<ReportsPage session={session} />} />
        <Route path="/manutencao" element={session.role === 'ditel_admin' ? <DitelMaintenancePage session={session} /> : <UnitMaintenancePage session={session} />} />
        <Route path="/missoes-tecnicas" element={session.role === 'ditel_admin' ? <DitelMissionsPage session={session} /> : <MissionsPage session={session} />} />
        <Route path="/tipos-equipamento" element={<EquipmentTypesPage session={session} />} />
        <Route path="/auditoria" element={<AuditPage session={session} />} />
        <Route path="/administracao" element={<AdministrationPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>

  return (
    <AppShell
      context={{
        unitName: session.unit?.name ?? 'DITEL',
        roleLabel: session.role === 'ditel_admin' ? 'Administração estadual' : 'Usuário da unidade',
        scopeLabel: session.unit ? `Escopo ${session.unit.acronym}` : 'Escopo estadual',
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
  const navigate = useNavigate()

  async function login(registration: string, password: string) {
    clearProtectedQueryCache()
    const session = await createSession(authApi, registration, password)
    if (session) {
      onSessionChange(session)
      navigate('/dashboard', { replace: true })
    }
    return session
  }

  return <LoginPage onLogin={login} />
}

export function AppRoutes({ session, onSessionChange }: AppRoutesProps) {
  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <LoginRoute onSessionChange={onSessionChange} />} />
      <Route path="*" element={session ? <ProtectedRoutes session={session} onSessionChange={onSessionChange} /> : <Navigate to="/login" replace />} />
    </Routes>
  )
}
