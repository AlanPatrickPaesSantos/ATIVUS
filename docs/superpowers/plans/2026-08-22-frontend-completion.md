# SIGAT Frontend Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Finish the SIGAT frontend as a coherent, visually reviewable prototype matching the approved institutional PMPA/DITEL design.

**Architecture:** Keep the React/Vite SPA and existing shared tokens/components. Build each feature behind the existing role-aware routes, use TanStack Query/MSW fixtures until the real API exists, and preserve top navigation with desktop-first responsive behavior.

**Tech Stack:** React, TypeScript, Vite, React Router, TanStack Query, Testing Library, MSW, Playwright and existing SIGAT CSS tokens.

**Spec:** `output/pdf/sigat-arquitetura-fundacao-frontend.pdf` and the approved conversation decisions.

## Global Constraints

- Desktop is the primary environment; tablet and mobile remain usable.
- Login uses matrícula + senha and references PMPA/DITEL institutionally.
- Equipment information has priority on Unit screens.
- Support and Telecom are automatic routing sections, never a user choice.
- Equipment detail is a popup with tabs when information is extensive.
- Calls can link existing equipment and accept documents/photos; maintenance missions remain in the existing maintenance system.
- Do not present placeholder pages as finished product screens.

### Task 1: Login and shared visual shell

**Files:**
- Modify: `frontend/src/features/auth/pages/LoginPage.tsx`
- Modify: `frontend/src/shared/styles/index.css`
- Modify: `frontend/src/shared/ui/brand/SigatMark.tsx` only if needed for the institutional lockup
- Tests: `frontend/src/features/auth/pages/LoginPage.test.tsx`

Implement the institutional login card, error/loading states, keyboard focus, responsive layout and PMPA/DITEL copy. Preserve the existing matrícula/senha contract and accessible name `Entrar`. Add tests for render, submit, invalid credentials and loading.

Run `npm test -- --run src/features/auth/pages/LoginPage.test.tsx` and `npm run typecheck`.

### Task 2: Unit dashboard and inventory review surface

**Files:**
- Modify: `frontend/src/features/dashboard/pages/UnitDashboardPage.tsx`
- Modify: `frontend/src/features/dashboard/components/UnitMetricCards.tsx`
- Modify: `frontend/src/features/dashboard/components/EquipmentSituationSummary.tsx`
- Modify: `frontend/src/features/dashboard/components/RecentActivity.tsx`
- Modify: `frontend/src/features/inventory/pages/UnitInventoryPage.tsx`
- Modify: `frontend/src/features/inventory/components/InventoryToolbar.tsx`
- Modify: `frontend/src/features/inventory/components/InventoryTable.tsx`
- Tests: existing Unit dashboard and inventory tests

Make the Unit landing screen equipment-first, visually balanced and demonstrably complete. Ensure dashboard cards, situation summary, recent activity, inventory filters, pagination, empty/error/loading states and modal entry all use the shared visual language. Do not add missions or a Support/Telecom selector.

Run focused tests, `npm run typecheck` and `npm run build`.

### Task 3: Calls flow

**Files:**
- Create/modify: `frontend/src/features/calls/pages/CallsPage.tsx`
- Create/modify: `frontend/src/features/calls/components/CallForm.tsx`
- Create/modify: `frontend/src/features/calls/components/CallReview.tsx`
- Create/modify: `frontend/src/features/calls/api/callsApi.ts`
- Modify: `frontend/src/app/routes.tsx`
- Modify: `frontend/src/shared/api/msw/handlers.ts`
- Tests: `frontend/src/features/calls/**/*.test.tsx`

Build the real `/chamados` screen: problem selection automatically displays the responsible section (Suporte or Telecom), supports adding already-catalogued equipment, attachments for documents/photos, mandatory review before submission, and reads `equipmentId` from the equipment handoff. Keep submission as a fixture boundary and do not implement maintenance missions.

Run focused tests, full Vitest and typecheck.

### Task 4: DITEL and remaining module screens

**Files:**
- Modify: `frontend/src/features/dashboard/pages/DitelDashboardPage.tsx`
- Create/modify: `frontend/src/features/reports/pages/ReportsPage.tsx`
- Create/modify: `frontend/src/features/movements/pages/MovementsPage.tsx`
- Modify: `frontend/src/app/routes.tsx`
- Modify: `frontend/src/shared/ui/layout/AppShell.tsx`
- Tests: feature tests for DITEL, reports and movements

Replace remaining generic module placeholders with useful, visually complete DITEL screens: statewide metrics, unit/equipment overview, administrative access, report preview/export boundary and movement history. Keep DITEL options richer than Unit without changing the top-nav design.

Run focused tests, full Vitest and build.

### Task 5: Integration and visual quality gate

**Files:**
- Modify: `frontend/e2e/unit-dashboard.spec.ts`
- Modify: `frontend/e2e/unit-inventory.spec.ts`
- Create: `frontend/e2e/calls.spec.ts`
- Create: `frontend/e2e/visual-smoke.spec.ts`
- Modify: `frontend/package.json` only for verification scripts

Run the complete Unit and DITEL journeys in Chromium, including login, dashboard, inventory, detail modal, call handoff, calls review flow and mobile menu. Capture and fix visual regressions, stale errors, overflow and inaccessible controls. Finish with `npm run verify` and `npm run test:e2e`.
