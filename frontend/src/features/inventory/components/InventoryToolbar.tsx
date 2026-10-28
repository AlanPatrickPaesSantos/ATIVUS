import { useEffect, useState, type ChangeEvent } from 'react'
import type { InventoryFacetsResponse } from '../../../shared/api/contracts'
import type { OrganizationalFilterOptionsResponse } from '../../organizationalStructure/api/organizationalStructureApi'

export type InventoryFilterValues = {
  search: string; type: string; model: string; situation: string; commandId?: string; unitId?: string; municipality?: string; region?: string; section?: string; period?: string
}

type InventoryToolbarProps = { filters: InventoryFilterValues; onChange: (filters: Partial<InventoryFilterValues>) => void; facets?: InventoryFacetsResponse; facetsError?: boolean; onRetryFacets?: () => void; organizationOptions?: OrganizationalFilterOptionsResponse; organizationOptionsLoading?: boolean; isStatewide?: boolean; scopeName?: string }

export const situationLabels: Record<string, string> = { active: 'Em operação', maintenance: 'Em manutenção', inactive: 'Inativo', lost: 'Extraviado', written_off: 'Baixado' }

function selectChange(onChange: InventoryToolbarProps['onChange'], key: keyof InventoryFilterValues) {
  return (event: ChangeEvent<HTMLSelectElement>) => onChange({ [key]: event.target.value })
}

function FacetSelect({ label, ariaLabel, value, options, emptyLabel, onChange, formatOption = (option) => option }: { label: string; ariaLabel: string; value: string; options: string[]; emptyLabel: string; onChange: (event: ChangeEvent<HTMLSelectElement>) => void; formatOption?: (option: string) => string }) {
  return <label>{label}<select aria-label={ariaLabel} value={value} onChange={onChange}><option value="">{emptyLabel}</option>{options.map((option) => <option key={option} value={option}>{formatOption(option)}</option>)}</select></label>
}

export function InventoryToolbar({ filters, onChange, facets, facetsError = false, onRetryFacets, organizationOptions, organizationOptionsLoading = false, isStatewide = false, scopeName = '3º BPM' }: InventoryToolbarProps) {
  const [search, setSearch] = useState(filters.search)
  useEffect(() => setSearch(filters.search), [filters.search])
  useEffect(() => {
    if (search === filters.search) return
    const timeout = window.setTimeout(() => onChange({ search }), 300)
    return () => window.clearTimeout(timeout)
  }, [filters.search, onChange, search])

  const optionalFacets = [
    ...(facets?.municipalities.length ? [{ label: 'Município', ariaLabel: 'Município', value: filters.municipality ?? '', options: facets.municipalities, emptyLabel: 'Todos os municípios', key: 'municipality' as const }] : []),
    ...(facets?.regions.length ? [{ label: 'Região', ariaLabel: 'Região', value: filters.region ?? '', options: facets.regions, emptyLabel: 'Todas as regiões', key: 'region' as const }] : []),
    ...(facets?.sections.length ? [{ label: 'Seção responsável', ariaLabel: 'Seção responsável', value: filters.section ?? '', options: facets.sections, emptyLabel: 'Todas as seções', key: 'section' as const }] : []),
  ]

  return <aside aria-label="Filtros do inventário" className="inventory-toolbar">
    <div className="inventory-toolbar__heading"><span>Inventário</span><strong>Equipamentos</strong></div>
    <label className="inventory-toolbar__search"><span>Buscar</span><input aria-label="Buscar equipamento" placeholder="Buscar por patrimônio, tipo, modelo ou marca" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    {facetsError ? <div role="alert" className="inventory-toolbar__status">Não foi possível carregar as opções do inventário.<button type="button" onClick={onRetryFacets}>Tentar novamente opções</button></div> : null}
    {organizationOptionsLoading ? <div role="status" className="inventory-toolbar__status">Carregando comandos e unidades subordinadas...</div> : null}
    {isStatewide ? <>
      <label>Comando intermediário<select aria-label="Comando intermediário" value={filters.commandId ?? ''} onChange={(event) => onChange({ commandId: event.target.value, unitId: '' })} disabled={organizationOptionsLoading}><option value="">Todos os comandos</option>{(organizationOptions?.commands ?? []).map((command) => <option key={command.id} value={command.id}>{command.name}</option>)}</select></label>
      <label>Unidade subordinada<select aria-label="Unidade subordinada" value={filters.unitId ?? ''} onChange={(event) => onChange({ unitId: event.target.value })} disabled={organizationOptionsLoading}><option value="">Todas as unidades do comando</option>{(filters.commandId ? (organizationOptions?.commands.find((command) => command.id === filters.commandId)?.units ?? []) : (organizationOptions?.units ?? [])).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}{filters.commandId && organizationOptions && !organizationOptions.commands.find((command) => command.id === filters.commandId)?.units.length ? <option value="" disabled>Nenhuma unidade subordinada cadastrada</option> : null}</select></label>
    </> : null}
    <FacetSelect label="Tipo" ariaLabel="Tipo" value={filters.type} options={facets?.types ?? []} emptyLabel="Todos os tipos" onChange={selectChange(onChange, 'type')} />
    <FacetSelect label="Modelo" ariaLabel="Modelo" value={filters.model} options={facets?.models ?? []} emptyLabel="Todos os modelos" onChange={selectChange(onChange, 'model')} />
    <details><summary>Filtros</summary><FacetSelect label="Situação" ariaLabel="Situação" value={filters.situation} options={facets?.situations ?? []} emptyLabel="Todas as situações" formatOption={(option) => situationLabels[option] ?? option} onChange={selectChange(onChange, 'situation')} />{optionalFacets.map((facet) => { const { key, ...props } = facet; return <FacetSelect key={key} {...props} onChange={selectChange(onChange, key)} /> })}</details>
    <div className="inventory-toolbar__scope"><span>Escopo atual</span><strong>{scopeName}</strong><small>{isStatewide ? 'Visão consolidada autorizada' : 'Unidade autenticada'}</small></div>
  </aside>
}
