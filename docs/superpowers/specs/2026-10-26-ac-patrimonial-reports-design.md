# Relatórios patrimoniais da AC — desenho

## Intenção

Entregar uma área exclusiva de relatórios para `ac_operator` e leitura administrativa para `ditel_admin`, usando `Equipment` como fonte do estoque/custódia e `AcTransfer` como fonte das distribuições. Consultas são somente leitura e não alteram patrimônio, custódia, transferências ou histórico.

## Escopo

- estoque atual da AC: RP, N/S, identificação, tipo, modelo e situação;
- distribuições: data, unidade, entregador, recebedor, quantidade e BG;
- filtro por unidade, período, RP, tipo, modelo, situação e BG;
- histórico por RP, com entradas atuais de `Equipment.history` marcadas como `DITEL` e eventos de `AcTransfer` marcados como `AC`;
- indicadores de estoque disponível, bens distribuídos e transferências no período.

Termo de Transferência em DOCX/PDF e qualquer alteração no fluxo `Movement/DITEL` ficam fora desta fase.

## Abordagem escolhida

Um endpoint agregado `GET /api/v1/ac/reports/patrimonial` concentra filtros, escopo, ordenação e paginação no backend. A alternativa de várias consultas compostas no frontend foi descartada porque repetiria regras de autorização e aumentaria o risco de inconsistência entre estoque e distribuição.

## Regras de contagem

- `availableStock`: quantidade de documentos `Equipment` distintos ainda com `custody.scope=AC`, `custody.unit=null` e `unit=null`; somente situação elegível para estoque disponível (`active`).
- `distributedGoods`: quantidade de `equipmentId` distintos nos `AcTransfer` confirmados do período/filtros.
- `transfers`: quantidade de documentos `AcTransfer` confirmados do período/filtros.
- filtros de RP/tipo/modelo aplicam-se ao `Equipment` oficial; unidade/período/BG aplicam-se ao `AcTransfer`.

## Segurança e contrato

O endpoint aceita somente `ac_operator` e `ditel_admin`; `unit_user` recebe 403. Nenhuma resposta contém hash, senha, token, chave de idempotência ou sessão. O contrato será adicionado ao OpenAPI e coberto por testes de rota, integração de consistência, frontend e E2E.
