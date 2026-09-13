import type { MaintenanceItem } from '../api/maintenanceApi'
import { maintenanceStatusLabels } from './MaintenanceTable'

export function MaintenanceDetail({ item, onClose }: { item: MaintenanceItem; onClose: () => void }) {
  return <div className="maintenance-detail">
    <dl>
      <div><dt>Equipamento</dt><dd>{item.equipment.patrimony} · {item.equipment.type} {item.equipment.brand} {item.equipment.model}</dd></div>
      <div><dt>Descrição</dt><dd>{item.description}</dd></div>
      <div><dt>Tipo</dt><dd>{item.type === 'corrective' ? 'Corretiva' : 'Preventiva'}</dd></div>
      <div><dt>Situação</dt><dd>{maintenanceStatusLabels[item.status]}</dd></div>
      {item.diagnosis ? <div><dt>Diagnóstico</dt><dd>{item.diagnosis}</dd></div> : null}
      {item.service ? <div><dt>Serviço</dt><dd>{item.service}</dd></div> : null}
      {item.technicalResponsible ? <div><dt>Responsável técnico</dt><dd>{item.technicalResponsible}</dd></div> : null}
      <div><dt>Data de entrada</dt><dd>{new Date(item.openedAt).toLocaleDateString('pt-BR')}</dd></div>
      {item.completedAt ? <div><dt>Conclusão</dt><dd>{new Date(item.completedAt).toLocaleDateString('pt-BR')}</dd></div> : null}
      {item.observations ? <div><dt>Observações</dt><dd>{item.observations}</dd></div> : null}
    </dl>
    <footer><button type="button" className="button-link" onClick={onClose}>Fechar</button></footer>
  </div>
}