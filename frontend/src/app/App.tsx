import { BrowserRouter } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AppProviders } from './providers'
import { AppRoutes } from './routes'
import { authApi } from '../features/auth/api/authApi'
import { clearSession, getSession, restoreSession } from '../shared/auth/session'

export function App() {
  const [session, setSession] = useState(getSession)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    let mounted = true
    void restoreSession(authApi)
      .then((restoredSession) => {
        if (mounted) setSession(restoredSession)
      })
      .catch(() => {
        clearSession()
        if (mounted) setSession(null)
      })
      .finally(() => {
        if (mounted) setSessionReady(true)
      })

    return () => {
      mounted = false
    }
  }, [])

  return (
    <AppProviders>
      <BrowserRouter>
        {sessionReady
          ? <AppRoutes session={session} onSessionChange={setSession} />
          : <main aria-busy="true"><p>ATIVUS</p><p>Carregando sessão…</p></main>}
      </BrowserRouter>
    </AppProviders>
  )
}
