import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ModalProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  ariaLabel?: string
  className?: string
}

const maxWidths = { sm: '28rem', md: '42rem', lg: '64rem' }

const activePortals: HTMLElement[] = []
const inertSnapshots = new Map<HTMLElement, boolean>()

function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia?.('(max-width: 640px)').matches ?? false)

  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 640px)')
    if (!media) return
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener?.('change', update)
    media.addListener?.(update)
    return () => {
      media.removeEventListener?.('change', update)
      media.removeListener?.(update)
    }
  }, [])

  return isMobile
}

function syncModalInertness() {
  if (activePortals.length === 0) {
    inertSnapshots.forEach((wasInert, element) => {
      if (wasInert) element.setAttribute('inert', '')
      else element.removeAttribute('inert')
    })
    inertSnapshots.clear()
    return
  }

  const topPortal = activePortals[activePortals.length - 1]
  const targetElements = Array.from(document.body.children).filter((element) => element !== topPortal) as HTMLElement[]
  const targetSet = new Set(targetElements)

  targetElements.forEach((element) => {
    if (!inertSnapshots.has(element)) inertSnapshots.set(element, element.hasAttribute('inert'))
    element.setAttribute('inert', '')
  })

  inertSnapshots.forEach((wasInert, element) => {
    if (!targetSet.has(element)) {
      if (wasInert) element.setAttribute('inert', '')
      else element.removeAttribute('inert')
    }
  })
}

function registerModal(portal: HTMLElement) {
  if (!activePortals.includes(portal)) activePortals.push(portal)
  syncModalInertness()
}

function unregisterModal(portal: HTMLElement) {
  const index = activePortals.indexOf(portal)
  if (index >= 0) activePortals.splice(index, 1)
  syncModalInertness()
}

export function Modal({ open, title, onClose, children, size = 'md', ariaLabel, className = '' }: ModalProps) {
  const [portalElement] = useState(() => document.createElement('div'))
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const isMobile = useMobileViewport()

  useEffect(() => {
    document.body.appendChild(portalElement)
    return () => portalElement.remove()
  }, [portalElement])

  useEffect(() => {
    if (!open) return
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    registerModal(portalElement)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    return () => {
      unregisterModal(portalElement)
      document.body.style.overflow = previousOverflow
      previouslyFocusedRef.current?.focus()
    }
  }, [open, portalElement])

  if (!open) return null

  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { onClose(); return }
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  return createPortal(
    <div className="modal-backdrop" data-mobile={isMobile} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={dialogRef} className={`modal-dialog ${className}`.trim()} data-layout="layered" data-mobile={isMobile} data-size={size} role="dialog" aria-modal="true" aria-label={ariaLabel} aria-labelledby={ariaLabel ? undefined : titleId} onKeyDown={trapFocus} style={{ maxWidth: maxWidths[size] }}>
        <header className="modal-dialog__header" data-section="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button ref={closeButtonRef} className="modal-dialog__close" type="button" aria-label="Fechar" onClick={onClose}>×</button>
        </header>
        <div className="modal-dialog__body" data-section="modal-body">{children}</div>
      </div>
    </div>,
    portalElement,
  )
}
