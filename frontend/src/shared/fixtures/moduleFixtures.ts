export type MovementKind = 'transferencia' | 'baixa' | 'alocacao'

export const ditelFixture = {
  metrics: [
    { label: 'Equipamentos cadastrados', value: '1.248', tone: 'operational' },
    { label: 'Unidades monitoradas', value: '36', tone: 'available' },
    { label: 'Em manutenção', value: '47', tone: 'attention' },
    { label: 'Pendências críticas', value: '12', tone: 'critical' },
  ],
  units: [
    { name: 'Unidade Centro', coverage: '98%', equipment: 184, attention: 2 },
    { name: 'Unidade Norte', coverage: '94%', equipment: 126, attention: 4 },
    { name: 'CIOp Metropolitano', coverage: '91%', equipment: 238, attention: 6 },
  ],
  equipment: [
    { label: 'Em operação', value: 1189 },
    { label: 'Em manutenção', value: 47 },
    { label: 'Requer atenção', value: 12 },
  ],
  criticalCalls: [
    { id: 'call-401', subject: 'Falha de conectividade no CIOp', unitId: 'ciop', unitName: 'CIOp Metropolitano', priority: 'Crítico', status: 'Em atendimento', equipmentType: 'Switch', updatedAt: '2026-08-30T08:00:00.000Z' },
    { id: 'call-402', subject: 'Rádio operacional indisponível', unitId: 'unit-centro', unitName: 'Unidade Centro', priority: 'Crítica', status: 'Em atendimento', equipmentType: 'Rádio portátil', updatedAt: '2026-08-30T08:01:00.000Z' },
    { id: 'call-403', subject: 'Impressora da recepção parada', unitId: 'unit-norte', unitName: 'Unidade Norte', priority: 'Crítico', status: 'Triagem DITEL', equipmentType: 'Impressora', updatedAt: '2026-08-30T08:02:00.000Z' },
    { id: 'call-404', subject: 'Enlace de dados instável', unitId: 'unit-centro', unitName: 'Unidade Centro', priority: 'Crítica', status: 'Em análise', equipmentType: 'Switch', updatedAt: '2026-08-30T08:03:00.000Z' },
    { id: 'call-405', subject: 'Impressora do arquivo sem resposta', unitId: 'unit-centro', unitName: 'Unidade Centro', priority: 'Alta', status: 'Em análise', equipmentType: 'Impressora', updatedAt: '2026-08-01T11:00:00.000Z' },
  ],
  pendingMovements: [
    { id: 'pending-01', description: 'Transferência de switch aguardando aceite', unitId: 'unit-centro', equipmentType: 'Switch', requestedAt: '2026-08-30T12:00:00.000Z' },
    { id: 'pending-02', description: 'Baixa de impressora aguardando documentação', unitId: 'unit-centro', equipmentType: 'Impressora', requestedAt: '2026-08-30T13:00:00.000Z' },
    { id: 'pending-03', description: 'Alocação de rádio aguardando confirmação', unitId: 'unit-norte', equipmentType: 'Rádio portátil', requestedAt: '2026-08-30T14:00:00.000Z' },
    { id: 'pending-04', description: 'Transferência de impressora do arquivo', unitId: 'unit-centro', equipmentType: 'Impressora', requestedAt: '2026-08-01T09:00:00.000Z' },
  ],
} as const

export const reportScopes = [
  { value: 'statewide', label: 'Todo o estado', inventory: '1.248 equipamentos', movements: '86 movimentações', pending: '12 pendências' },
  { value: 'unit-centro', label: 'Unidade Centro', inventory: '184 equipamentos', movements: '42 movimentações', pending: '2 pendências' },
  { value: 'unit-norte', label: 'Unidade Norte', inventory: '126 equipamentos', movements: '18 movimentações', pending: '4 pendências' },
  { value: 'ciop', label: 'CIOp Metropolitano', inventory: '238 equipamentos', movements: '26 movimentações', pending: '6 pendências' },
] as const

export const reportOptions = [
  { value: 'inventario', label: 'Inventário consolidado', description: 'Posição patrimonial por unidade e situação.', filterLabel: 'Situação', filterOptions: ['Todas as situações', 'Ativo', 'Em manutenção', 'Inativo'] },
  { value: 'tipo', label: 'Relatório por tipo de equipamento', description: 'Distribuição patrimonial conforme o tipo de equipamento.', filterLabel: 'Tipo de equipamento', filterOptions: ['Todos os tipos', 'Rádio portátil', 'Computador portátil', 'Impressora'] },
  { value: 'situacao', label: 'Relatório por situação', description: 'Equipamentos agrupados pela situação operacional atual.', filterLabel: 'Situação', filterOptions: ['Todas as situações', 'Ativo', 'Em manutenção', 'Baixado', 'Perdido', 'Inativo'] },
  { value: 'manutencao', label: 'Equipamentos em manutenção', description: 'Ativos encaminhados ou mantidos em manutenção.', filterLabel: 'Situação de manutenção', filterOptions: ['Em manutenção', 'Aguardando manutenção', 'Manutenção concluída'] },
  { value: 'situacoes-especiais', label: 'Baixados, perdidos e inativos', description: 'Relação de equipamentos fora de operação.', filterLabel: 'Situação', filterOptions: ['Todas', 'Baixado', 'Perdido', 'Inativo'] },
  { value: 'garantias', label: 'Relatório de garantias', description: 'Cobertura de garantia e ativos próximos do vencimento.', filterLabel: 'Garantia', filterOptions: ['Todas as garantias', 'Vence em 30 dias', 'Vence em 90 dias', 'Sem garantia informada'] },
  { value: 'movimentacoes', label: 'Relatório de movimentações', description: 'Transferências, alocações e baixas registradas no período.', filterLabel: 'Tipo de movimentação', filterOptions: ['Todos os tipos', 'Transferência', 'Alocação', 'Baixa'] },
  { value: 'chamados', label: 'Relatório de chamados', description: 'Chamados técnicos conforme prioridade e situação.', filterLabel: 'Prioridade e situação', filterOptions: ['Todos os chamados', 'Críticos pendentes', 'Em atendimento', 'Resolvidos'] },
  { value: 'missoes', label: 'Relatório de missões técnicas', description: 'Missões técnicas conforme a situação de execução.', filterLabel: 'Situação da missão', filterOptions: ['Todas as missões', 'Planejada', 'Em execução', 'Concluída'] },
] as const

export const movementFixture: { id: string; type: MovementKind; title: string; equipment: string; origin: string; destination: string; date: string; responsible: string; unitId: string }[] = [
  { id: 'mov-01', type: 'transferencia', title: 'Transferência entre unidades', equipment: 'Rádio APX-2000 · UC-004', origin: 'Unidade Centro', destination: 'Unidade Norte', date: '22 ago. 2026 · 14:20', responsible: 'Carlos Lima', unitId: 'unit-centro' },
  { id: 'mov-02', type: 'baixa', title: 'Baixa patrimonial', equipment: 'Impressora LaserJet · UC-017', origin: 'Unidade Centro', destination: 'Arquivo patrimonial', date: '21 ago. 2026 · 10:05', responsible: 'Ana Souza', unitId: 'unit-centro' },
  { id: 'mov-03', type: 'alocacao', title: 'Alocação interna', equipment: 'Notebook ProBook · UN-001', origin: 'Reserva técnica', destination: 'Recepção · Unidade Norte', date: '20 ago. 2026 · 08:40', responsible: 'Bruno Lima', unitId: 'unit-norte' },
]
