import { useState, type FormEvent } from 'react'
import { SigatMark } from '../../../shared/ui/brand/SigatMark'
import type { SessionContext } from '../../../shared/auth/types'

type LoginPageProps = {
  onLogin: (registration: string, password: string) => Promise<SessionContext | null>
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setIsSubmitting(true)
    setError('')
    try {
      const session = await onLogin(String(data.get('registration') ?? ''), String(data.get('password') ?? ''))
      if (!session) setError('Não foi possível entrar com essas credenciais.')
    } catch {
      setError('Não foi possível entrar com essas credenciais.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-page" data-testid="login-split-screen" data-visual-variant="institutional-night-frame">
      <div className="login-page__content">
        <section className="login-page__identity" aria-labelledby="login-institution-title">
          <header className="login-page__institution">
            <SigatMark />
            <div className="login-page__institution-copy">
              <p>Polícia Militar do Pará</p>
              <p>Diretoria de Telemática</p>
            </div>
          </header>
          <div className="login-page__tagline">
            <h2 id="login-institution-title">Inventário sob controle.<br />Decisão com contexto.</h2>
            <p>Acesso institucional ao patrimônio tecnológico, chamados e movimentações das Unidades.</p>
          </div>
          <div className="login-page__workflow" data-testid="login-workflow" data-visual-variant="stationed-operational-flow" aria-hidden="true"><span>Inventário</span><span>Chamados</span><span>Movimentações</span></div>
        </section>
        <section className="login-card" data-testid="login-card" data-visual-variant="centered-institutional-credential" aria-labelledby="login-title">
          <p className="login-card__mobile-context" data-testid="login-mobile-context" aria-label="PMPA, Diretoria de Telemática">PMPA · DITEL</p>
          <div className="login-card__institutional-lockup" data-testid="login-institutional-lockup">
            <img src="/images/brasao-pmpa.png" alt="Brasão da Polícia Militar do Pará" />
            <strong>PMPA · DITEL</strong>
          </div>
          <div className="login-card__heading">
            <span className="login-card__access-anchor" data-testid="login-access-anchor" aria-hidden="true" />
            <h1 id="login-title">Entrar no SIGAT</h1>
            <p className="login-card__intro">Use sua matrícula e senha institucional.</p>
          </div>
          <form className="login-form" onSubmit={handleSubmit} aria-busy={isSubmitting}>
            <label htmlFor="registration">Matrícula</label>
            <input id="registration" name="registration" autoComplete="username" inputMode="numeric" required autoFocus placeholder="Digite sua matrícula" />
            <label htmlFor="password">Senha</label>
            <span className="login-form__password"><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required placeholder="Digite sua senha" /><button type="button" aria-label={showPassword ? 'Ocultar' : 'Mostrar'} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></span>
            {error && <p className="login-form__error" role="alert">{error}</p>}
            <button className="login-form__submit" type="submit" aria-label="Entrar" disabled={isSubmitting}>{isSubmitting ? 'Entrando…' : 'Entrar'}</button>
          </form>
          <p className="login-card__footer">Ambiente de uso restrito</p>
        </section>
      </div>
    </main>
  )
}
