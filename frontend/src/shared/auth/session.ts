import type { SessionAdapter, SessionContext, SessionLifecycleAdapter } from './types'

let activeSession: SessionContext | null = null

export function getSession() {
  return activeSession
}

export function setSession(session: SessionContext | null) {
  activeSession = session
}

export async function createSession(adapter: SessionAdapter, registration: string, password: string) {
  activeSession = await adapter.signIn(registration, password)
  return activeSession
}

export async function restoreSession(adapter: Pick<SessionLifecycleAdapter, 'restore'>) {
  activeSession = await adapter.restore()
  return activeSession
}

export async function changeSessionPassword(adapter: Pick<SessionLifecycleAdapter, 'changePassword'>, newPassword: string) {
  activeSession = await adapter.changePassword(newPassword)
  return activeSession
}

export function clearSession() {
  activeSession = null
}
