# AC Transfer Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not create commits for this repository.

**Goal:** Gerar DOCX editável e PDF provisório a partir de `AcTransfer` confirmado, sem alterar o patrimônio.

**Architecture:** `AcTransfer` fornece snapshots históricos; um serviço normaliza o snapshot e possui dois renderizadores server-side (`docx` e `pdfkit`). Uma rota protegida busca a transferência, valida o formato e responde o arquivo; o frontend adiciona ações de exportação no histórico e detalhe.

**Tech Stack:** Express, Mongoose, TypeScript, `docx@9.14.0`, `pdfkit@0.20.2`, Vitest, Supertest, React Query, Playwright, OpenAPI.

**Spec:** `docs/superpowers/specs/2026-10-26-ac-transfer-document-design.md`

## Global Constraints

- Não criar commits, branches, tags, PRs ou publicações.
- Não modificar dados de produção, executar migrações ou alterar `Movement/DITEL`.
- TDD estrito: teste RED observado antes de cada mudança de produção.
- Exportação somente para `ac_operator` e `ditel_admin`; `unit_user` não acessa documentos AC.
- Exportação é somente leitura e não repete baixa, auditoria ou mutação de transferência.
- Documento sempre contém “NÃO OFICIAL — MODELO PROVISÓRIO”.
- Limite de 500 materiais por transferência e 10 MiB por arquivo gerado.

## Review Focus

- Snapshot antigo sem identificação/modelo continua exportável sem consultar `Equipment` — teste de compatibilidade.
- Conteúdo com caracteres XML/PDF especiais não vira marcação ou código — teste de sanitização/conteúdo.
- ID inválido, formato inválido e usuário sem escopo são rejeitados antes de buscar/gerar — teste de rota.
- Reemissão do mesmo documento não cria nem altera registros — teste de contagem/estado.
- Documento com vários bens e sem BG mantém tabela, campos e ausência explícita de BG — teste de geração.

### Task 1: Snapshot e modelo normalizado

**Files:**
- Modify: `backend/src/models/AcTransfer.ts`
- Modify: `backend/src/repositories/acTransfersRepository.ts`
- Test: `backend/src/models/acPhaseOne.test.ts` or new focused snapshot test

- [ ] Escrever RED para `identification`/`model` capturados em novo snapshot e fallback “Não informado” em snapshot antigo.
- [ ] Implementar campos compatíveis sem exigir migração de documentos existentes.
- [ ] Rodar testes AC e refatorar o normalizador.

### Task 2: Renderizadores DOCX/PDF

**Files:**
- Modify: `backend/package.json`, `backend/package-lock.json`
- Create: `backend/src/services/acTransferDocuments.ts`
- Test: `backend/src/services/acTransferDocuments.test.ts`

- [ ] Instalar somente `docx@9.14.0`, `pdfkit@0.20.2` e tipos necessários após avaliação de licença/compatibilidade.
- [ ] Escrever RED para DOCX válido, PDF válido, conteúdo provisório, BG opcional, múltiplos materiais, assinaturas vazias e reemissão determinística.
- [ ] Implementar `buildAcTransferDocumentModel`, `renderAcTransferDocx` e `renderAcTransferPdf`, com limite de 10 MiB.
- [ ] Rodar testes focados e typecheck.

### Task 3: Endpoint protegido e contrato

**Files:**
- Create: `backend/src/routes/acTransferDocumentRoutes.ts`
- Modify: `backend/src/app.ts`
- Modify: `docs/api/openapi.yaml`
- Test: `backend/src/routes/acTransferDocumentRoutes.test.ts`

- [ ] Escrever RED para permissões, ID/formato inválidos, headers, conteúdo e reemissão sem mutação.
- [ ] Implementar `GET /api/v1/ac/transfers/:transferId/document?format=docx|pdf` com busca somente em `AcTransfer` confirmado.
- [ ] Documentar respostas binárias, parâmetros e erros no OpenAPI.
- [ ] Rodar rota, integração e lint OpenAPI.

### Task 4: Ações de exportação no frontend

**Files:**
- Modify: `frontend/src/shared/api/contracts.ts`
- Modify: `frontend/src/features/ac/api/acApi.ts`
- Modify: `frontend/src/features/ac/pages/AcTransfersPage.tsx`
- Modify: `frontend/src/shared/api/msw/handlers.ts`
- Modify: `frontend/e2e/ac-workflow.spec.ts`
- Tests: `frontend/src/features/ac/pages/AcTransfersPage.test.tsx` and API tests

- [ ] Escrever RED para botões DOCX/PDF no histórico/detalhe e tratamento de download/erro.
- [ ] Implementar download autenticado sem expor conteúdo ou alterar cache de patrimônio.
- [ ] Atualizar MSW e E2E para exportação com e sem BG e reemissão.
- [ ] Rodar testes frontend e E2E.

### Task 5: Verificação final

- [ ] Rodar backend typecheck, testes completos, integração e build.
- [ ] Rodar frontend typecheck, testes completos, build e Playwright.
- [ ] Rodar OpenAPI lint, `npm audit` em backend/frontend e `git diff --check`.
- [ ] Revisar dependências, arquivos gerados, conteúdo provisório, segurança, regressões e pendências para Fase 6.2.
