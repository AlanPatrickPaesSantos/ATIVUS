import { UnauthorizedError } from '../../../shared/api/errors'
import { httpClient } from '../../../shared/api/httpClient'
import type { SessionContext, SessionLifecycleAdapter } from '../../../shared/auth/types'

export const authApi: SessionLifecycleAdapter = {
  async signIn(registration: string, password: string): Promise<SessionContext | null> {
    try {
      return await httpClient<SessionContext>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration, password }),
      })
    } catch (error) {
      if (error instanceof UnauthorizedError) return null
      throw error
    }
  },
  async restore(): Promise<SessionContext | null> {
    try {
      return await httpClient<SessionContext>('/session')
    } catch (error) {
      if (error instanceof UnauthorizedError) return null
      throw error
    }
  },
  async changePassword(newPassword: string): Promise<SessionContext> {
    return httpClient<SessionContext>('/auth/password-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword }),
    })
  },
  async signOut(): Promise<void> {
    await httpClient<void>('/auth/logout', { method: 'POST' })
  },
}
