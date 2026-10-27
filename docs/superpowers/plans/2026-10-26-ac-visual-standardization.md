# AC Visual Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Padronizar visualmente Materiais AC, Transferências AC e Relatórios AC com os tokens e componentes visuais existentes, sem alterar regras patrimoniais ou contratos.

**Architecture:** Adicionar classes semânticas pequenas às três páginas e centralizar a apresentação em `frontend/src/shared/styles/modules.css`. Reutilizar `button-link`, `module-panel`, `data-table`, `Modal`, `EmptyState`, `ErrorState` e `LoadingState`; nenhuma lógica de API ou autorização será alterada.

**Tech Stack:** React, TypeScript, CSS global importado por Vite, Vitest, Playwright.

**Spec:** Aprovação da opção 1 na solicitação do usuário de 2026-10-26.

## Global Constraints

- Preservar regras de estoque, custódia, transferências, permissões, APIs, autenticação, MongoDB e geração de documentos.
- Centralizar estilos novos em `frontend/src/shared/styles/modules.css`.
- Preservar os quatro screenshots modificados e não executar deploy ou push.
- Não criar dados reais; E2E deve usar o MSW existente.

## Review Focus

- Controles nativos sem classe nas páginas AC devem receber a aparência ATIVUS e foco visível — testes/inspeção Playwright das três rotas.
- Formulário de transferência com seleção múltipla deve permanecer legível e utilizável em mobile — teste E2E AC e viewport mobile.
- Tabelas e histórico não podem causar overflow inesperado — checks de `scrollWidth` e screenshot desktop/mobile.
- Estados de loading, erro, vazio e confirmação devem manter contraste e hierarquia — testes existentes de páginas AC e inspeção visual.
- DITEL e unidade não devem perder estilos globais — suíte frontend e smoke E2E existente.

### Task 1: Add semantic AC markup coverage

**Files:**
- Modify: `frontend/src/features/ac/pages/AcMaterialsPage.tsx`
- Modify: `frontend/src/features/ac/pages/AcTransfersPage.tsx`
- Modify: `frontend/src/features/ac/pages/AcReportsPage.tsx`
- Test: existing AC page tests plus targeted class/interaction assertions where needed.

- [ ] Add semantic classes and stable landmarks without changing data or event behavior.
- [ ] Run focused tests and confirm the new assertions fail before CSS implementation.

### Task 2: Centralize AC styles

**Files:**
- Modify: `frontend/src/shared/styles/modules.css`

- [ ] Style AC page shells, forms, controls, checkboxes, tabs, tables, pagination, feedback and responsive states using existing tokens.
- [ ] Run focused tests, typecheck and build.

### Task 3: Rendered visual validation

**Files:**
- No committed screenshots; evidence saved outside the repository.

- [ ] Run AC workflow E2E with MSW.
- [ ] Inspect all three routes at desktop and mobile viewports, including refresh/navigation and overflow checks.
- [ ] Run frontend suite, typecheck, production build and `git diff --check`.

## Completion

No commit is created in this task. The final report lists source changes, tests, visual evidence and remaining risks; the four existing screenshots remain untouched.
