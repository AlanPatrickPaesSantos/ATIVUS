import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from './AppShell'

test('provides a skip link and one main landmark around content', () => {
  render(
    <MemoryRouter>
      <AppShell
        context={{
          unitName: 'Unidade Centro',
          roleLabel: 'Gestor de patrimônio',
          scopeLabel: 'Escopo regional',
          userName: 'Ana Souza',
        }}
        navigation={[{ label: 'Painel', href: '/painel', icon: '◈' }]}
        activePath="/painel"
        onLogout={() => undefined}
      >
        <h1>Painel operacional</h1>
      </AppShell>
    </MemoryRouter>,
  )

  expect(screen.getByRole('link', { name: /pular para o conteúdo/i })).toHaveAttribute('href', '#main-content')
  expect(screen.getAllByRole('main')).toHaveLength(1)
  expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
  expect(screen.getByRole('heading', { name: 'Painel operacional' })).toBeInTheDocument()
})
