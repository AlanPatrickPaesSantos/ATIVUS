# SIGAT Pendências de Segurança, Consistência e UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task with review gates.

**Goal:** Corrigir as pendências encontradas na auditoria frontend/backend sem expor segredos, quebrar contratos ou introduzir operações administrativas não autorizadas.

**Architecture:** Correções backend serão aplicadas nas fronteiras de middleware, serviços e repositórios, com validação server-side e eventos auditáveis. Correções frontend permanecerão nos hooks/adapters/páginas existentes, distinguindo vazio, erro e dados de demonstração. Cada lote é independente e só avança após revisão.

**Tech Stack:** TypeScript, Express, Mongoose/MongoDB, React, Vitest, Playwright, OpenAPI/Redocly.

**Spec:** `docs/backup-planejamento-frontend-sigat.md` e achados da auditoria independente registrada na conversa.

## Global Constraints

- Não criar Git/GitHub, commits, branches ou publicação.
- Teste RED antes de cada mudança de produção; validar GREEN e regressão após cada lote.
- Nunca expor `passwordHash`, senha, tokens, `tokenDigest` ou `sessionId`.
- Preservar contratos públicos e o escopo administrativo já existente.
- Não implementar reset de senha nesta rodada.
- Mudanças de segurança devem ter testes de abuso e revalidação independente.

### Task 1: Proteções de autenticação e sessão

**Arquivos:** backend auth middleware/routes/services/models/tests/package conforme padrão existente.

Adicionar rate limit distribuível por IP e matrícula/conta, expiração absoluta/inatividade de sessão e Origin/Referer policy ou CSRF compatível com cookie. Primeiro escrever testes para brute force, sessão expirada e origem inválida; observar RED; implementar mínimo; rodar testes focados, backend completo, typecheck/build.

### Task 2: Integridade de unidades e movimentações

**Arquivos:** `backend/src/routes/movementRoutes.ts`, repositórios/modelos/helpers e testes.

Escrever testes RED para destino inexistente/inativo/metadados adulterados e unidade do usuário desativada. Resolver destino no servidor por referência canônica ativa, persistir dados canônicos e rejeitar escopos inválidos. Revalidar autorização, concorrência, integração e OpenAPI.

### Task 3: Auditoria e confiabilidade operacional

**Arquivos:** `backend/src/models/AuditEvent.ts`, repositório/serviço de auditoria, rotas, `docs/api/openapi.yaml`, testes e documentação.

Testar RED para campos de ator/entidade/unidade/antes-depois, consulta exclusiva DITEL, filtros/paginação, ausência de segredos e falha de auditoria. Implementar schema/indexes, endpoint somente leitura, retenção explícita e atomicidade por transação/outbox/idempotência. Validar Redocly e falhas controladas.

### Task 4: Consistência de dados, migration e readiness

**Arquivos:** `equipmentReadRepository`, migration/runbook, health/readiness, scripts e testes.

Testar RED para detalhe completo do equipamento, migration ledger/dry-run/limpeza controlada do legado e readiness Mongo. Implementar sem apagar dados sem validação; documentar rollback. Adicionar lint de código se o stack já suportar sem alterar contratos.

### Task 5: Correções funcionais frontend

**Arquivos:** dashboard DITEL, CallsPage/DitelCallsPage, MovementsPage, UnitInventoryPage, MSW e testes/E2E.

Escrever testes RED para filtros que mudam resultados, erro/retry de chamados, retry sem rejeição não tratada, permissão de cadastro de equipamento e métrica derivada. Implementar usando dados/contratos existentes; resetar fixtures entre testes; manter layout e acessibilidade.

### Task 6: Revisão final independente

Executar backend/frontend completos, integrações, E2E, typechecks, builds, Redocly, audit, diff-check e análise de segredos. Delegar revisão final separada; corrigir somente achados reprodutíveis, repetindo o gate.

## Gate por tarefa

Cada tarefa exige: teste RED observado, implementação mínima, testes focados e regressão aprovados, inspeção de segurança/contrato e veredito independente `APROVADO`. Achado P1/P0 impede a tarefa seguinte.
