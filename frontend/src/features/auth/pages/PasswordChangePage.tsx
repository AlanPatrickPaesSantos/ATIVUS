import { useState, type FormEvent } from 'react'

type PasswordChangePageProps = {
  userName: string
  onChangePassword: (newPassword: string) => Promise<void>
  onLogout: () => void
}

export function PasswordChangePage({ userName, onChangePassword, onLogout }: PasswordChangePageProps) {
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const newPassword = String(data.get('newPassword') ?? '')
    const confirmation = String(data.get('confirmPassword') ?? '')

    setError('')

    if (newPassword.length < 8) {
      setError('A nova senha deve ter pelo menos 8 caracteres.')
      return
    }

    if (newPassword !== confirmation) {
      setError('As senhas não conferem.')
      return
    }

    setIsSubmitting(true)
    try {
      await onChangePassword(newPassword)
    } catch {
      setError('Não foi possível atualizar a senha. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="password-change-page" aria-labelledby="password-change-title">
      <section className="password-change-card">
        <p className="password-change-card__eyebrow">Troca obrigatória</p>
        <h1 id="password-change-title">Defina uma nova senha</h1>
        <p>Olá, {userName}. Para continuar usando o ATIVUS, cadastre uma senha definitiva para substituir a senha temporária.</p>
        <form className="login-form" onSubmit={handleSubmit} aria-busy={isSubmitting}>
          <label htmlFor="newPassword">Nova senha</label>
          <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={8} />
          <label htmlFor="confirmPassword">Confirmar nova senha</label>
          <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} />
          {error && <p className="login-form__error" role="alert">{error}</p>}
          <button className="login-form__submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Atualizando…' : 'Atualizar senha'}</button>
        </form>
        <button className="password-change-card__logout" type="button" onClick={onLogout}>Sair</button>
      </section>
    </main>
  )
}
