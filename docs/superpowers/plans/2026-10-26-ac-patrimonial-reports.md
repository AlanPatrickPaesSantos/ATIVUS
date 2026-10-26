# AC Patrimonial Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Criar relatórios patrimoniais AC somente leitura, consistentes com `Equipment` e `AcTransfer`, com filtros, indicadores, permissões e interface exclusiva.

**Architecture:** Um repositório de leitura agrega estoque, distribuições e histórico; uma rota valida query e autorização; a página AC usa React Query e o mesmo padrão visual existente. O fluxo de distribuição e o relatório geral permanecem separados.

**Tech Stack:** Express, Mongoose, TypeScript, React, React Query, Vitest, MSW, Playwright, OpenAPI.

**Spec:** `docs/superpowers/specs/2026-10-26-ac-patrimonial-reports-design.md`

## Global Constraints

- Não criar commits, branches, tags, PRs ou publicações.
- TDD estrito: RED observado antes de cada mudança de produção.
- Escopo AC somente no backend; `unit_user` nunca acessa dados AC.
- Consultas não modificam estoque, custódia, transferências ou históricos.
- Não implementar DOCX/PDF nem alterar `Movement/DITEL`.
- Nenhuma resposta/log/teste expõe segredos ou internals de idempotência.

## Review Focus

- Repetição do mesmo RP em múltiplas linhas não pode inflar indicadores — teste no repositório.
- Filtro de unidade/período/BG não pode vazar distribuição fora do recorte — teste de rota.
- RP inexistente ou inválido deve produzir vazio/erro de validação claro — teste de rota.
- `unit_user` deve receber 403 mesmo com query AC válida — teste de permissão.
- Após distribuição, o bem sai do estoque AC e aparece como distribuído — teste de integração/E2E.

### Task 1: Repositório e contrato de relatório AC

**Files:**
- Create: `backend/src/repositories/acReportsRepository.ts`
- Test: `backend/src/repositories/acReportsRepository.test.ts`

- [ ] Escrever testes RED para contagens sem duplicação, filtros e histórico distinguindo fontes.
- [ ] Rodar o teste focado e observar falha por módulo ausente.
- [ ] Implementar consultas Mongoose somente leitura e mapeadores públicos.
- [ ] Rodar teste focado e backend relacionado; refatorar mantendo GREEN.

### Task 2: Endpoint protegido e OpenAPI

**Files:**
- Create: `backend/src/routes/acReportRoutes.ts`
- Modify: `backend/src/app.ts`
- Modify: `docs/api/openapi.yaml`
- Test: `backend/src/routes/acReportRoutes.test.ts`

- [ ] Escrever RED para 401/403, filtros, paginação/ordenação e consistência pós-distribuição.
- [ ] Implementar parser estrito, autorização AC/DITEL e registro no app.
- [ ] Documentar endpoint, parâmetros e schemas no OpenAPI.
- [ ] Rodar testes focados e lint OpenAPI.

### Task 3: API frontend, tela AC e permissões

**Files:**
- Modify: `frontend/src/shared/api/contracts.ts`
- Modify: `frontend/src/shared/api/queryKeys.ts`
- Modify: `frontend/src/shared/auth/permissions.ts`
- Modify: `frontend/src/app/routes.tsx`
- Modify: `frontend/src/features/ac/api/acApi.ts`
- Modify: `frontend/src/features/ac/api/acQueries.ts`
- Create: `frontend/src/features/ac/pages/AcReportsPage.tsx`
- Modify: `frontend/src/shared/styles/modules.css`
- Tests: frontend unit tests, MSW handlers, `frontend/e2e/ac-workflow.spec.ts`

- [ ] Escrever RED para query, navegação e estados loading/vazio/erro/filtros.
- [ ] Implementar contrato/query, permissão `ac_reports`, rota `/ac/relatorios` e UI.
- [ ] Atualizar MSW e E2E cobrindo AC/DITEL/unit_user e baixa imediata.
- [ ] Rodar testes frontend e E2E.

### Task 4: Verificação completa e revisão

- [ ] Rodar typecheck, testes, integração e build do backend.
- [ ] Rodar typecheck, testes, build e Playwright do frontend.
- [ ] Rodar lint OpenAPI e `npm audit` em backend/frontend.
- [ ] Inspecionar diff, regressões, segredos e prontidão para Fase 6.
