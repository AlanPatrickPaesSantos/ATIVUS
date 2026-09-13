import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Modal } from './Modal'
import { Tabs } from './Tabs'

function ControlledModal({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Abrir detalhes</button>
      <Modal open={open} title="Detalhes" onClose={() => { setOpen(false); onClose() }}>
        <button type="button">Ação principal</button>
      </Modal>
    </>
  )
}

test('uses dialog semantics, moves focus into the dialog, and returns it on close', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()

  render(<ControlledModal onClose={onClose} />)

  const opener = screen.getByRole('button', { name: 'Abrir detalhes' })
  await user.click(opener)

  const dialog = screen.getByRole('dialog', { name: 'Detalhes' })
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(dialog).toHaveAttribute('data-layout', 'layered')
  expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus()
  expect(document.body.firstElementChild).toHaveAttribute('inert')

  await user.click(screen.getByRole('button', { name: 'Fechar' }))
  expect(onClose).toHaveBeenCalledOnce()
  expect(opener).toHaveFocus()
})

test('calls onClose when Escape is pressed while open', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()

  render(<Modal open title="Detalhes" onClose={onClose}>Conteúdo</Modal>)
  await user.keyboard('{Escape}')

  expect(onClose).toHaveBeenCalledOnce()
})

test('preserves a pre-existing inert background attribute after closing', async () => {
  const user = userEvent.setup()
  const preExistingBackground = document.createElement('aside')
  preExistingBackground.setAttribute('inert', '')
  document.body.appendChild(preExistingBackground)

  try {
    render(<ControlledModal onClose={() => undefined} />)
    await user.click(screen.getByRole('button', { name: 'Abrir detalhes' }))
    await user.click(screen.getByRole('button', { name: 'Fechar' }))

    expect(preExistingBackground).toHaveAttribute('inert')
  } finally {
    preExistingBackground.remove()
  }
})

function NestedModals() {
  const [outerOpen, setOuterOpen] = useState(false)
  const [innerOpen, setInnerOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOuterOpen(true)}>Abrir externo</button>
      <Modal open={outerOpen} title="Externo" onClose={() => setOuterOpen(false)}>
        <button type="button" onClick={() => setInnerOpen(true)}>Abrir interno</button>
        <Modal open={innerOpen} title="Interno" onClose={() => setInnerOpen(false)}>Conteúdo interno</Modal>
      </Modal>
    </>
  )
}

test('keeps the background inert until the last nested modal closes', async () => {
  const user = userEvent.setup()
  const { container } = render(<NestedModals />)

  await user.click(screen.getByRole('button', { name: 'Abrir externo' }))
  await user.click(screen.getByRole('button', { name: 'Abrir interno' }))

  const outerPortal = screen.getByRole('dialog', { name: 'Externo' }).parentElement
  expect(container).toHaveAttribute('inert')
  expect(outerPortal?.parentElement).toHaveAttribute('inert')

  await user.click(screen.getByRole('dialog', { name: 'Interno' }).querySelector('button[aria-label="Fechar"]')!)
  expect(container).toHaveAttribute('inert')
  expect(screen.getByRole('dialog', { name: 'Externo' }).parentElement?.parentElement).not.toHaveAttribute('inert')

  await user.click(screen.getByRole('dialog', { name: 'Externo' }).querySelector('button[aria-label="Fechar"]')!)
  expect(container).not.toHaveAttribute('inert')
})

test('selects the first and last enabled tabs with Home and End', async () => {
  const user = userEvent.setup()

  function ControlledTabs() {
    const [value, setValue] = useState('disabled')
    return <Tabs value={value} onChange={setValue} items={[
      { id: 'first', label: 'Primeira', content: 'Conteúdo inicial' },
      { id: 'disabled', label: 'Desabilitada', disabled: true, content: 'Não aparece' },
      { id: 'last', label: 'Última', content: 'Conteúdo final' },
    ]} />
  }

  render(<ControlledTabs />)
  const first = screen.getByRole('tab', { name: 'Primeira' })
  const last = screen.getByRole('tab', { name: 'Última' })

  expect(first).toHaveAttribute('aria-selected', 'true')
  first.focus()
  await user.keyboard('{End}')
  expect(last).toHaveFocus()
  expect(last).toHaveAttribute('aria-selected', 'true')

  await user.keyboard('{Home}')
  expect(first).toHaveFocus()
  expect(first).toHaveAttribute('aria-selected', 'true')
})

test('switches to a viewport modal when the media query changes', async () => {
  let matches = false
  const listeners = new Set<() => void>()
  const media = {
    get matches() { return matches },
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    addListener: (listener: () => void) => listeners.add(listener),
    removeListener: (listener: () => void) => listeners.delete(listener),
  }
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => media })

  render(<Modal open title="Responsivo" onClose={vi.fn()}>Conteúdo</Modal>)
  expect(screen.getByRole('dialog')).toHaveAttribute('data-mobile', 'false')
  matches = true
  listeners.forEach((listener) => listener())
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('data-mobile', 'true'))
})
