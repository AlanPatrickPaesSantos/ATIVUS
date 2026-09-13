import type { SessionAdapter, SessionContext } from '../../../shared/auth/types'

const fixtureUsers: Array<SessionContext & { password: string }> = [
  {
    userId: 'unit-001',
    name: 'Ana Souza',
    registration: '100001',
    password: 'sigat-unit',
    role: 'unit_user',
    unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' },
  },
  {
    userId: 'ditel-001',
    name: 'Carlos Lima',
    registration: '200001',
    password: 'sigat-ditel',
    role: 'ditel_admin',
    unit: null,
  },
  {
    userId: 'reset-001',
    name: 'Patrícia Reset',
    registration: '300001',
    password: 'senha-temporaria',
    role: 'ditel_admin',
    unit: null,
    mustChangePassword: true,
  },
]

export const fixtureSessionAdapter: SessionAdapter = {
  async signIn(registration, password) {
    const user = fixtureUsers.find((candidate) => candidate.registration === registration && candidate.password === password)
    if (!user) return null
    const { password: _password, ...session } = user
    return session
  },
}
