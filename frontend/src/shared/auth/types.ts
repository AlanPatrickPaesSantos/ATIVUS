export type UserRole = 'ditel_admin' | 'unit_user'

export type SessionContext = {
  userId: string
  name: string
  registration: string
  role: UserRole
  unit: { id: string; name: string; acronym: string } | null
  mustChangePassword?: boolean
}

export type NavigationItem = {
  label: string
  href: string
  icon?: string
  requires?: string
}

export type SessionAdapter = {
  signIn(registration: string, password: string): Promise<SessionContext | null>
}

export type SessionLifecycleAdapter = SessionAdapter & {
  restore(): Promise<SessionContext | null>
  changePassword(newPassword: string): Promise<SessionContext>
  signOut(): Promise<void>
}
