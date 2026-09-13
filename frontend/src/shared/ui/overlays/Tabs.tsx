import { useRef, type ReactNode } from 'react'

export type TabItem = {
  id: string
  label: string
  content?: ReactNode
  disabled?: boolean
}

type TabsProps = {
  items: TabItem[]
  value: string
  onChange: (value: string) => void
}

export function Tabs({ items, value, onChange }: TabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const enabledItems = items.filter((item) => !item.disabled)
  const selectedItem = items.find((item) => item.id === value && !item.disabled) ?? enabledItems[0]
  const selectedValue = selectedItem?.id

  function moveFocus(currentIndex: number, direction: -1 | 1) {
    let nextIndex = currentIndex
    do {
      nextIndex = (nextIndex + direction + items.length) % items.length
    } while (items[nextIndex].disabled && nextIndex !== currentIndex)
    const nextItem = items[nextIndex]
    if (nextItem && !nextItem.disabled) {
      onChange(nextItem.id)
      tabRefs.current[nextIndex]?.focus()
    }
  }

  function selectBoundary(boundary: 'first' | 'last') {
    const target = boundary === 'first' ? enabledItems[0] : enabledItems[enabledItems.length - 1]
    if (!target) return
    const targetIndex = items.findIndex((item) => item.id === target.id)
    onChange(target.id)
    tabRefs.current[targetIndex]?.focus()
  }

  return (
    <div className="tabs">
      <div className="tabs__list" role="tablist" aria-label="Seções">
        {items.map((item, index) => (
          <button
            ref={(element) => { tabRefs.current[index] = element }}
            key={item.id}
            id={`tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={item.id === selectedValue}
            aria-controls={`tabpanel-${item.id}`}
            tabIndex={item.id === selectedValue ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') { event.preventDefault(); moveFocus(index, 1) }
              if (event.key === 'ArrowLeft') { event.preventDefault(); moveFocus(index, -1) }
              if (event.key === 'Home') { event.preventDefault(); selectBoundary('first') }
              if (event.key === 'End') { event.preventDefault(); selectBoundary('last') }
            }}
          >{item.label}</button>
        ))}
      </div>
      {selectedItem && <div className="tabs__panel" id={`tabpanel-${selectedItem.id}`} role="tabpanel" aria-labelledby={`tab-${selectedItem.id}`} tabIndex={0}>{selectedItem.content}</div>}
    </div>
  )
}
