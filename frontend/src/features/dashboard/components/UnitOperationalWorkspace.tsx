import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useInventoryQuery } from '../../inventory/api/inventoryQueries'

const statusLabel = {
  active: 'Ativo',
  maintenance: 'Manutenção',
  inactive: 'Inativo',
  lost: 'Extraviado',
  written_off: 'Baixado',
} as const

const situationOptions = [
  { value: 'all', label: 'Situação' },
  { value: 'active', label: 'Ativo' },
  { value: 'maintenance', label: 'Em manutenção' },
  { value: 'inactive', label: 'Inativo' },
]

export function UnitOperationalWorkspace() {
  const [search, setSearch] = useState('')
  const [situation, setSituation] = useState('all')
  const [isSituationOpen, setIsSituationOpen] = useState(false)
  const situationFilterRef = useRef<HTMLDivElement>(null)
  const situationButtonRef = useRef<HTMLButtonElement>(null)
  const situationOptionsRef = useRef<HTMLDivElement>(null)
  const inventoryQuery = useInventoryQuery({ page: 1, pageSize: 5 })
  const items = useMemo(() => inventoryQuery.data?.items ?? [], [inventoryQuery.data?.items])
  const visibleItems = items.filter((item) => {
    const searchable = `${item.patrimony} ${item.type} ${item.brand} ${item.model}`.toLocaleLowerCase()
    return (!search || searchable.includes(search.toLocaleLowerCase())) && (situation === 'all' || item.situation === situation)
  })
  const selectedSituation = situationOptions.find((option) => option.value === situation) ?? situationOptions[0]

  useEffect(() => {
    if (!isSituationOpen) return
    const selectedOption = situationOptionsRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
    selectedOption?.focus()
  }, [isSituationOpen])

  useEffect(() => {
    if (!isSituationOpen) return
    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !situationFilterRef.current?.contains(event.target)) setIsSituationOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [isSituationOpen])

  function closeSituationMenu() {
    setIsSituationOpen(false)
    situationButtonRef.current?.focus()
  }

  function selectSituation(nextSituation: string) {
    setSituation(nextSituation)
    closeSituationMenu()
  }

  function moveSituationFocus(direction: 1 | -1) {
    const options = Array.from(situationOptionsRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + options.length) % options.length
    options[nextIndex]?.focus()
  }

  return (
    <div className="unit-operations-grid">
      <section className="unit-inventory-snapshot" aria-labelledby="dashboard-inventory-title">
        <header className="unit-operations-panel__header">
          <div>
            <h2 id="dashboard-inventory-title">Equipamentos da Unidade</h2>
          </div>
          <Link className="button-link button-link--quiet" to="/inventario">Ver inventário</Link>
        </header>
        <div className="unit-inventory-snapshot__filters">
          <label>
            <span className="sr-only">Buscar equipamento</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por tipo, modelo ou patrimônio" />
          </label>
          <div className="unit-inventory-snapshot__situation-filter" ref={situationFilterRef}>
            <button ref={situationButtonRef} className="unit-inventory-snapshot__situation-trigger" type="button" aria-label="Filtrar por situação" aria-haspopup="listbox" aria-expanded={isSituationOpen} aria-controls="dashboard-situation-options" onClick={() => setIsSituationOpen((open) => !open)} onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); closeSituationMenu() }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setIsSituationOpen(true) }
            }}>
              <span>{selectedSituation.label}</span>
            </button>
            {isSituationOpen ? <div id="dashboard-situation-options" ref={situationOptionsRef} className="unit-inventory-snapshot__situation-options" role="listbox" aria-label="Filtrar por situação" onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); closeSituationMenu() }
              if (event.key === 'ArrowDown') { event.preventDefault(); moveSituationFocus(1) }
              if (event.key === 'ArrowUp') { event.preventDefault(); moveSituationFocus(-1) }
            }}>
              {situationOptions.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === situation} onClick={() => selectSituation(option.value)}>{option.label}</button>)}
            </div> : null}
          </div>
        </div>
        <div className="unit-inventory-snapshot__table" role="table" aria-label="Resumo de equipamentos da Unidade">
          <div className="unit-inventory-snapshot__row unit-inventory-snapshot__row--header" role="row">
            <span role="columnheader">Patrimônio</span><span role="columnheader">Tipo / modelo</span><span role="columnheader">Situação</span><span role="columnheader">Localização</span>
          </div>
          {inventoryQuery.isLoading ? <p className="unit-inventory-snapshot__message" role="status">Carregando equipamentos…</p> : null}
          {!inventoryQuery.isLoading && visibleItems.map((item) => (
            <Link className="unit-inventory-snapshot__row" role="row" to={`/inventario?equipamento=${item.id}`} key={item.id}>
              <strong role="cell">{item.patrimony}</strong><span role="cell">{item.type} · {item.brand} {item.model}</span><span role="cell" className={`unit-status unit-status--${item.situation}`}>{statusLabel[item.situation]}</span><span role="cell">{item.location}</span>
            </Link>
          ))}
          {!inventoryQuery.isLoading && visibleItems.length === 0 ? <p className="unit-inventory-snapshot__message">Nenhum equipamento encontrado para este filtro.</p> : null}
        </div>
      </section>
    </div>
  )
}
