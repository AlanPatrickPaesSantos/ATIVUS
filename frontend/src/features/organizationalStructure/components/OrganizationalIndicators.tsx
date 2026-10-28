import type { OrganizationalIndicators as Indicators } from '../api/organizationalStructureApi'

export function OrganizationalIndicators({ indicators }: { indicators: Indicators }) {
  return <section className="organizational-indicators" aria-label="Indicadores da organização">
    <div className="organizational-indicators__cards"><article><span>Unidades no escopo</span><strong>{indicators.units.toLocaleString('pt-BR')}</strong></article><article><span>Equipamentos no escopo</span><strong>{indicators.equipment.total.toLocaleString('pt-BR')}</strong></article><article><span>Demonstrativos</span><strong>{indicators.equipment.demonstrative.toLocaleString('pt-BR')}</strong></article></div>
    <div className="organizational-indicators__breakdown"><section><h3>Por situação</h3>{Object.entries(indicators.bySituation).map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}</section><section><h3>Por tipo</h3>{Object.entries(indicators.byType).map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}</section></div>
    <p className="organizational-demo-note">Os registros exibidos como demonstrativos são fictícios e não representam patrimônio oficial da PMPA.</p>
  </section>
}
