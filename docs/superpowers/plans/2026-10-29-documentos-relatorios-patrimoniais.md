# Documentos e Relatórios Patrimoniais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task.

**Goal:** Implementar as Fases 3.5A e 3.5B com rastreabilidade documental provisória e relatórios com datas reais e consultas limitadas.

**Architecture:** A Fase 3.5A mantém `acTransferDocuments.ts` como normalizador/renderizador e usa `recordAuditEvent` para registrar emissões, sem persistir o arquivo nem criar coleção. A Fase 3.5B centraliza filtros de data no repositório de relatórios e usa agregações MongoDB para produzir os mesmos contratos públicos.

**Tech Stack:** TypeScript, Express, Mongoose, MongoDB replica set de teste, `docx`, `pdfkit`, React, React Query, Vitest e Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-documentos-relatorios-patrimoniais-design.md`

## Global Constraints

- Não executar commit, push ou deploy.
- Não alterar MongoDB Atlas, Render ou outros worktrees.
- Não criar coleções adicionais.
- Não alterar custódia, locks, transações ou processos administrativos.
- Manter `ac-transfer-v1` como modelo provisório e não oficial.
- Não registrar sucesso de emissão quando a geração falhar.

## Review Focus

- Reemissão do mesmo documento deve gerar novo identificador de auditoria sem modificar a operação.
- Falha de renderização não pode deixar evento de sucesso.
- Snapshot AC legado deve continuar renderizando sem consultar equipamento atual.
- Data final deve incluir o dia inteiro e data invertida deve retornar 400.
- Escopo de unidade deve ser aplicado antes de agregação, contagem e exportação.

### Task 1: Auditoria e versionamento documental (Fase 3.5A)

**Files:**
- Modify: `backend/src/services/acTransferDocuments.ts`
- Modify: `backend/src/routes/acTransferDocumentRoutes.ts`
- Test: `backend/src/routes/acTransferDocumentRoutes.test.ts`
- Test: `backend/src/services/acTransferDocumentModel.test.ts`

**Interfaces:**
- Produces `AC_TRANSFER_DOCUMENT_TEMPLATE_VERSION = 'ac-transfer-v1'`.
- Produces response headers `X-Document-Template-Version` and `X-Document-Notice`.
- Records action `ac.transfer.document.emit` with `after` containing operationId, templateVersion, format, documentId, sha256 and emittedAt.

- [ ] Write failing tests for headers, audit payload, separate PDF/DOCX hashes, reemission, authorization and render failure.
- [ ] Run the focused route/service tests and confirm failure.
- [ ] Implement digest calculation and audit only after successful rendering, preserving existing binary contracts.
- [ ] Run focused tests and confirm all pass.

### Task 2: OpenAPI and document contract verification (Fase 3.5A)

**Files:**
- Modify: `docs/api/openapi.yaml`
- Test: `backend/src/openapi.test.ts`

- [ ] Add template/version/notice headers and the non-persistence disclaimer to OpenAPI.
- [ ] Add contract assertions for the document metadata headers.
- [ ] Run OpenAPI-focused tests and backend typecheck.

### Task 3: Real report date filters and database aggregation (Fase 3.5B backend)

**Files:**
- Modify: `backend/src/repositories/reportsRepository.ts`
- Modify: `backend/src/routes/reportRoutes.ts`
- Test: `backend/src/routes/reportRoutes.test.ts`

**Interfaces:**
- `InventoryReportFilters` gains optional ISO `from` and `to` dates.
- Fixed `REPORT_PERIODS` are removed from backend validation while legacy omitted-period requests remain valid.
- Existing response shapes remain compatible; `report.filters` reports `from` and `to` when supplied.

- [ ] Write failing tests for inclusive dates, invalid dates, inverted dates, combined filters and unit isolation.
- [ ] Run focused report tests and confirm failure.
- [ ] Implement shared date parsing and source-specific Mongo filters.
- [ ] Replace full document loops with aggregation/grouping or bounded grouped queries for inventory, calls and movements.
- [ ] Run focused report tests and confirm pass.

### Task 4: Report export and frontend filters (Fase 3.5B frontend)

**Files:**
- Modify: `frontend/src/shared/api/contracts.ts`
- Modify: `frontend/src/features/reports/api/reportsApi.ts`
- Modify: `frontend/src/features/reports/pages/ReportsPage.tsx`
- Test: `frontend/src/features/reports/pages/ReportsPage.test.tsx`

- [ ] Write failing tests for date inputs, combined query parameters, empty/error states and preview/export consistency.
- [ ] Run focused frontend tests and confirm failure.
- [ ] Replace fixed 2026 period options with `from`/`to` controls while preserving omitted-period compatibility.
- [ ] Pass the same committed filter object to preview and inventory export.
- [ ] Run focused frontend tests, typecheck and build.

### Task 5: Independent regression and E2E validation

**Files:**
- Modify only tests if regressions are found.

- [ ] Run backend and frontend full suites.
- [ ] Run OpenAPI, typecheck and builds.
- [ ] Run relevant Playwright suites using test data only.
- [ ] Run `git diff --check` and inspect worktree/original worktree status.
