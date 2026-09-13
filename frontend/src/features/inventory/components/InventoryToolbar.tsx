import { useEffect, useState, type ChangeEvent } from 'react'

export type InventoryFilterValues = {
  search: string
  type: string
  model: string
  situation: string
  unitId?: string
}

type InventoryToolbarProps = {
  filters: InventoryFilterValues
  onChange: (filters: Partial<InventoryFilterValues>) => void
  isStatewide?: boolean
  scopeName?: string
}

function selectChange(onChange: (filters: Partial<InventoryFilterValues>) => void, key: keyof InventoryFilterValues) {
  return (event: ChangeEvent<HTMLSelectElement>) => onChange({ [key]: event.target.value })
}

const statewideUnits = [
  { id: 'unit-centro', label: '3º BPM' },
  { id: 'unit-norte', label: 'Unidade Norte' },
]

export function InventoryToolbar({ filters, onChange, isStatewide = false, scopeName = '3º BPM' }: InventoryToolbarProps) {
  const [search, setSearch] = useState(filters.search)

  useEffect(() => {
    setSearch(filters.search)
  }, [filters.search])

  useEffect(() => {
    if (search === filters.search) return
    const timeout = window.setTimeout(() => onChange({ search }), 300)
    return () => window.clearTimeout(timeout)
  }, [filters.search, onChange, search])

  return (
    <aside aria-label="Filtros do inventário" className="inventory-toolbar">
      <div className="inventory-toolbar__heading"><span>Inventário</span><strong>Equipamentos</strong></div>
      <label className="inventory-toolbar__search"><span>Buscar</span><input aria-label="Buscar equipamento" placeholder="Buscar por patrimônio, tipo, modelo ou marca" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      {isStatewide && <label>Unidade monitorada<select aria-label="Unidade monitorada" value={filters.unitId ?? ''} onChange={selectChange(onChange, 'unitId')}><option value="">Todas as Unidades</option>{statewideUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}</select></label>}
      <label>Tipo<select aria-label="Tipo" value={filters.type} onChange={selectChange(onChange, 'type')}><option value="">Todos os tipos</option><option value="Rádio portátil">Rádio portátil</option><option value="Colete balístico">Colete balístico</option><option value="Veículo">Veículo</option><option value="Drone">Drone</option><option value="Computador portátil">Computador portátil</option><option value="Impressora">Impressora</option><option value="Notebook">Notebook</option><option value="Rádio">Rádio</option></select></label>
      <label>Modelo<select aria-label="Modelo" value={filters.model} onChange={selectChange(onChange, 'model')}><option value="">Todos os modelos</option><option value="APX 2000">APX 2000</option><option value="APX-2000">APX-2000</option><option value="Defesa MD-3A">Defesa MD-3A</option><option value="Hilux 4x4">Hilux 4x4</option><option value="Mavic 2 Enterprise">Mavic 2 Enterprise</option><option value="Latitude 5420">Latitude 5420</option><option value="LaserJet M404">LaserJet M404</option><option value="ProBook">ProBook</option><option value="Latitude">Latitude</option><option value="LaserJet">LaserJet</option></select></label>
      <details>
        <summary>Filtros</summary>
        <label>Situação<select aria-label="Situação" value={filters.situation} onChange={selectChange(onChange, 'situation')}><option value="">Todas as situações</option><option value="active">Em operação</option><option value="maintenance">Em manutenção</option><option value="inactive">Inativo</option><option value="lost">Extraviado</option><option value="written_off">Baixado</option></select></label>
      </details>
      <div className="inventory-toolbar__scope"><span>Escopo atual</span><strong>{scopeName}</strong><small>{isStatewide ? 'Visão consolidada autorizada' : 'Unidade autenticada'}</small></div>
    </aside>
  )
}
