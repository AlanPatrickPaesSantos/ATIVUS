# Etapa 3.4 — Central de Pendências Operacionais

## Matriz de estados auditados

| Origem | Estado pendente real | Providência indicada | Perfis com escopo |
| --- | --- | --- | --- |
| Transferência definitiva | `Pendente` | Autorizar transferência | `ditel_admin` |
| Transferência definitiva | `Aguardando recebimento` | Confirmar recebimento | unidade destinatária, conforme fluxo existente |
| Transferência definitiva | `Divergência` | Resolver divergência | responsáveis já definidos pelo fluxo de movimentação |
| Devolução ao AC | `Pendente` | Autorizar devolução ao AC | `ac_operator` |
| Devolução ao AC | `Aguardando recebimento` | Confirmar recebimento no AC | `ac_operator` |
| Devolução ao AC | `Divergência` | Resolver divergência | `ac_operator` |
| Chamado | `Aberto`, `Em análise`, `Em atendimento`, `Aguardando informação` | Atender ou atualizar chamado | DITEL e unidade dentro do escopo já existente |
| Manutenção | `open`, `in_progress` | Iniciar ou atualizar manutenção | DITEL e unidade dentro do escopo já existente |
| Missão técnica | `assigned`, `in_progress` | Iniciar ou atualizar missão | DITEL e unidade dentro do escopo já existente |

Estados `Recebida`, `Resolvido`, `Encerrado`, `completed`, `cancelled`, `Rejeitada` e `Cancelada` são terminais e não são retornados. A API não inventa prazo, SLA, prioridade ou responsável: prioridade só é retornada quando existe na fonte original.

## Estratégia de consulta

`GET /api/v1/pending-operations` consulta as cinco coleções originais em paralelo. Cada consulta aplica primeiro o escopo de autorização, o filtro de estado pendente e os filtros enviados; a contagem é feita com `countDocuments` e a leitura usa `sort`, `limit` e uma janela limitada à página solicitada. Os resultados são combinados somente após essas leituras, ordenados por `date DESC`, precedência da origem e identificador, e paginados.

Não existe coleção de pendências. A janela máxima de consulta é limitada para impedir carregamento ilimitado. A página e os contadores usam exatamente o mesmo conjunto de filtros e escopo.

## Permissões

- `ditel_admin`: todas as fontes, sem unidade restritiva, respeitando filtros solicitados.
- `ac_operator`: somente devoluções AC.
- `unit_user`: fontes relacionadas à própria unidade; filtro de outra unidade resulta em conjunto vazio.

O backend aplica essas regras independentemente da navegação do frontend. A tela é somente leitura e links para os módulos existentes; nenhuma pendência é concluída pela API agregadora.
