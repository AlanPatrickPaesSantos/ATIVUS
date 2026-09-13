# Frontend Foundation and Unit Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a fundação executável do frontend do SIGAT e entregar o primeiro fluxo vertical da Unidade: shell autenticado, dashboard da Unidade, inventário com filtros e detalhes do equipamento.

**Architecture:** React + TypeScript + Vite em uma SPA independente, servida como arquivos estáticos pelo Nginx. O frontend se comunica com uma API Node.js versionada em `/api/v1`; nesta primeira etapa, MSW fornece a API simulada para permitir desenvolvimento visual e testes sem inventar uma implementação de backend.

**Tech Stack:** React, TypeScript, Vite, React Router Data Mode, TanStack Query, TanStack Table, React Hook Form, Zod, Radix Primitives, Tailwind CSS, Vitest, Testing Library, MSW e Playwright.

**Spec:** `C:/Users/alanp/OneDrive/Documentos/ChatGPT/NEW PROMETHEUS/output/pdf/sigat-arquitetura-fundacao-frontend.pdf`

## Global Constraints

- O frontend será prioritariamente desktop, responsivo para tablets e celulares.
- A navegação principal ficará no topo; em telas menores, módulos secundários irão para `Mais` ou menu em tela cheia.
- Os perfis iniciais são `Administrador DITEL` e `Usuário da Unidade`.
- A API é a fonte de verdade para escopo, permissões, unidade responsável e auditoria.
- A primeira versão exige conexão ativa; não haverá sincronização offline.
- O servidor alvo é Debian, com Nginx, Node.js e MongoDB instalados diretamente, sem Docker.
- A sessão usará matrícula + senha; o logout invalida a sessão.
- HTTPS deverá ser configurado antes do uso real de credenciais, fotos ou documentos.
- A identidade visual usa Operação Noturna: `#090F1A`, `#111C2C`, `#2B7FFF`, `#27C18B`, `#F2C94C`, `#E46550`.
- Tipografia: Archivo para títulos, Inter para interface e JetBrains Mono para identificadores.
- Não adicionar Redux ou Zustand nesta etapa.
- Não adicionar módulos de Manutenção ou Missões técnicas; o SIGAT exibirá apenas informações relacionadas quando necessário.
- Toda tarefa termina com teste focado, build quando aplicável e commit separado.

---

### Task 1: Scaffold do frontend e políticas de execução

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.app.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/app/App.tsx`
- Create: `frontend/src/app/providers.tsx`
- Create: `frontend/src/vite-env.d.ts`
- Create: `frontend/.env.example`
- Create: `frontend/.gitignore`
- Test: `frontend/src/app/App.test.tsx`

**Interfaces:**
- Produces `AppProviders` para QueryClient, roteador e MSW em desenvolvimento.
- Produces script `dev`, `build`, `preview`, `test`, `test:watch` e `test:e2e`.
- Consumes somente as dependências aprovadas nesta especificação.

- [ ] **Step 1: Write the failing smoke test**

Create `frontend/src/app/App.test.tsx` with a test that mounts the application and expects the SIGAT brand and the route loading state:

```tsx
import { render, screen } from '@testing-library/react'
import { App } from './App'

test('renders the SIGAT application shell', () => {
  render(<App />)
  expect(screen.getByText('SIGAT')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run from `frontend/`:

```bash
npm test -- --run src/app/App.test.tsx
```

Expected: FAIL because the frontend package and `App` implementation do not exist.

- [ ] **Step 3: Scaffold the Vite React TypeScript application**

Create `frontend/package.json` with scripts and dependencies. Pin exact versions selected from the current stable releases during implementation; do not use wildcard ranges. The package must include React, Vite, TypeScript, React Router, TanStack Query, Vitest, Testing Library and MSW.

Create `frontend/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './shared/styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Create `frontend/src/app/providers.tsx` with one `QueryClient` configured for connected use:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

export function AppProviders({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

Create a minimal `App` that renders a temporary semantic `main` with the SIGAT brand; the final shell is delivered in Task 2.

- [ ] **Step 4: Add environment and build defaults**

Create `.env.example`:

```dotenv
VITE_API_BASE_URL=/api/v1
VITE_ENABLE_MSW=true
```

Configure Vite to expose only `VITE_` variables and to resolve `src` as `@`. Configure TypeScript with strict mode, no implicit any, unused locals and unused parameters enabled.

- [ ] **Step 5: Run tests and build**

Run:

```bash
npm test -- --run
npm run build
```

Expected: the smoke test passes and `frontend/dist/` is generated without TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "chore: scaffold sigat frontend"
```

### Task 2: Design tokens, fontes locais e AppShell

**Files:**
- Create: `frontend/src/shared/styles/tokens.css`
- Create: `frontend/src/shared/styles/index.css`
- Create: `frontend/src/shared/styles/fonts.css`
- Create: `frontend/src/shared/ui/brand/SigatMark.tsx`
- Create: `frontend/src/shared/ui/navigation/TopNav.tsx`
- Create: `frontend/src/shared/ui/navigation/TopNav.test.tsx`
- Create: `frontend/src/shared/ui/layout/AppShell.tsx`
- Create: `frontend/src/shared/ui/layout/AppShell.test.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/providers.tsx`

**Interfaces:**
- `AppShell({ children, context, navigation, onLogout })` renders the persistent application frame.
- `TopNav({ items, activePath, context, onLogout })` renders modules, active state, profile and logout.
- `NavigationItem` is `{ label: string; href: string; icon: ReactNode; requires?: Permission }`.

- [ ] **Step 1: Write failing shell and navigation tests**

Test that the active module is announced, the Unit context is visible and a DITEL-only item is not shown for a Unit user:

```tsx
test('shows unit context and active inventory module', () => {
  render(<TopNav items={unitItems} activePath="/inventario" context={unitContext} onLogout={vi.fn()} />)
  expect(screen.getByText('3º BPM')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /inventário/i })).toHaveAttribute('aria-current', 'page')
})
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test -- --run src/shared/ui/navigation/TopNav.test.tsx src/shared/ui/layout/AppShell.test.tsx
```

Expected: FAIL because the shell and navigation components do not exist.

- [ ] **Step 3: Define visual tokens**

Use semantic CSS variables rather than hard-coded colors inside components:

```css
:root {
  --sigat-night: #090f1a;
  --sigat-surface: #111c2c;
  --sigat-operational: #2b7fff;
  --sigat-available: #27c18b;
  --sigat-attention: #f2c94c;
  --sigat-critical: #e46550;
  --sigat-text: #f4f7fb;
  --sigat-muted: #9aa8b8;
  --sigat-border: #29384d;
}
```

Define spacing, radius, focus ring, z-index and motion tokens in the same file. Respect `prefers-reduced-motion` in `index.css`.

- [ ] **Step 4: Implement the shell and responsive navigation**

Build `TopNav` with semantic `nav`, visible focus, `aria-current`, a profile menu and an explicit Sair action. On desktop show approved modules in the top bar. On tablet group secondary items in `Mais`. On mobile use a full-screen menu while keeping current module and context visible.

`AppShell` must expose a skip link, render `TopNav`, provide a content landmark and prevent feature pages from recreating the top frame.

- [ ] **Step 5: Add local font loading and brand mark**

Place licensed font files under `frontend/public/fonts/` or use the approved internal asset location. Define `@font-face` for Archivo, Inter and JetBrains Mono. `SigatMark` must be text/SVG owned by the project and must not depend on a remote image service.

- [ ] **Step 6: Run tests, build and visual smoke check**

```bash
npm test -- --run
npm run build
npm run dev -- --host 127.0.0.1
```

Verify at desktop, 768px and 390px widths: no horizontal overflow, keyboard focus is visible, `Mais` appears at tablet width and the mobile menu traps focus while open.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/shared frontend/src/app frontend/public
git commit -m "feat: add sigat visual foundation and app shell"
```

### Task 3: Rotas, sessão simulada e escopo de navegação

**Files:**
- Create: `frontend/src/app/routes.tsx`
- Create: `frontend/src/shared/auth/types.ts`
- Create: `frontend/src/shared/auth/session.ts`
- Create: `frontend/src/shared/auth/permissions.ts`
- Create: `frontend/src/features/auth/data/sessionFixture.ts`
- Create: `frontend/src/features/auth/pages/LoginPage.tsx`
- Create: `frontend/src/features/auth/pages/LoginPage.test.tsx`
- Create: `frontend/src/features/dashboard/pages/UnitDashboardPage.tsx`
- Create: `frontend/src/features/dashboard/pages/DitelDashboardPage.tsx`
- Modify: `frontend/src/app/App.tsx`
- Test: `frontend/src/app/routes.test.tsx`

**Interfaces:**
- `SessionContext = { userId: string; name: string; registration: string; role: 'ditel_admin' | 'unit_user'; unit: UnitContext | null }`.
- `can(session, permission): boolean` is the only shared permission helper used by navigation and page guards.
- `getNavigation(session): NavigationItem[]` returns Unit or DITEL modules without duplicating shell markup.

- [ ] **Step 1: Write failing route and role tests**

Cover `/login`, `/dashboard`, `/inventario`, redirecting unauthenticated users to `/login`, and hiding DITEL administration from `unit_user`.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
npm test -- --run src/app/routes.test.tsx src/features/auth/pages/LoginPage.test.tsx
```

Expected: FAIL because routes and session provider do not exist.

- [ ] **Step 3: Define session and permission types**

Keep the role union closed to the two approved profiles. Never accept a unit identifier from a navigation click as authorization input.

- [ ] **Step 4: Implement the login route using fixture session data**

The fixture supports a successful matrícula + senha path and a generic failure message. Do not reveal whether a matrícula exists. Keep the session adapter isolated so the real API can replace it without changing page components.

- [ ] **Step 5: Implement route guards and role-aware navigation**

Authenticated Unit users land on their own dashboard. DITEL users land on the statewide dashboard. A direct navigation to an unauthorized route renders a permission state and does not fetch protected data.

- [ ] **Step 6: Run tests and build**

```bash
npm test -- --run
npm run build
```

Expected: all route, login and role tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app frontend/src/shared/auth frontend/src/features/auth frontend/src/features/dashboard
git commit -m "feat: add authenticated routes and role-aware scope"
```

### Task 4: API boundary, fixtures and query hooks

**Files:**
- Create: `frontend/src/shared/api/httpClient.ts`
- Create: `frontend/src/shared/api/errors.ts`
- Create: `frontend/src/shared/api/contracts.ts`
- Create: `frontend/src/shared/api/queryKeys.ts`
- Create: `frontend/src/shared/api/msw/handlers.ts`
- Create: `frontend/src/shared/api/msw/server.ts`
- Create: `frontend/src/shared/api/msw/browser.ts`
- Create: `frontend/src/features/dashboard/api/dashboardApi.ts`
- Create: `frontend/src/features/dashboard/api/dashboardQueries.ts`
- Create: `frontend/src/features/inventory/api/inventoryApi.ts`
- Create: `frontend/src/features/inventory/api/inventoryQueries.ts`
- Test: `frontend/src/shared/api/httpClient.test.ts`
- Test: `frontend/src/features/inventory/api/inventoryQueries.test.ts`

**Interfaces:**
- `httpClient<T>(path: string, init?: RequestInit): Promise<T>` adds the API base URL, credentials and normalized errors.
- `InventoryQuery = { search?: string; type?: string; model?: string; situation?: string; page: number; pageSize: number }`.
- `InventoryResponse = { items: EquipmentSummary[]; total: number; page: number; pageSize: number }`.
- `useInventoryQuery(query: InventoryQuery)` returns a TanStack Query result keyed by `['inventory', query]`.

- [ ] **Step 1: Write failing HTTP and query tests**

Test that a 401 becomes `UnauthorizedError`, a valid response is parsed as JSON and changing page or filter changes the query key.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
npm test -- --run src/shared/api/httpClient.test.ts src/features/inventory/api/inventoryQueries.test.ts
```

Expected: FAIL because the client and query hooks do not exist.

- [ ] **Step 3: Define domain contracts**

Create only the fields needed by the first Unit flow:

```ts
export type EquipmentSummary = {
  id: string
  patrimony: string
  type: string
  model: string
  brand: string
  situation: 'active' | 'maintenance' | 'inactive' | 'lost' | 'written_off'
  location: string
  unitName: string
}
```

Keep API field names explicit and map them to display labels at the feature boundary.

- [ ] **Step 4: Implement the HTTP client and MSW handlers**

Use `credentials: 'include'`, reject non-2xx responses, normalize `{ code, message, details }`, and provide fixture responses for Unit dashboard and inventory. Configure MSW only for local development and tests; production must call `/api/v1`.

- [ ] **Step 5: Implement query hooks**

Use serializable query keys that include every variable used by the request. Do not put query results in a global store.

- [ ] **Step 6: Run tests and build**

```bash
npm test -- --run
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/shared/api frontend/src/features/dashboard/api frontend/src/features/inventory/api
git commit -m "feat: add typed api boundary and inventory queries"
```

### Task 5: Componentes compartilhados de dados e estados

**Files:**
- Create: `frontend/src/shared/ui/feedback/LoadingState.tsx`
- Create: `frontend/src/shared/ui/feedback/ErrorState.tsx`
- Create: `frontend/src/shared/ui/feedback/EmptyState.tsx`
- Create: `frontend/src/shared/ui/data/StatusBadge.tsx`
- Create: `frontend/src/shared/ui/data/DataTable.tsx`
- Create: `frontend/src/shared/ui/overlays/Modal.tsx`
- Create: `frontend/src/shared/ui/overlays/Tabs.tsx`
- Create: `frontend/src/shared/ui/feedback/Toast.tsx`
- Test: `frontend/src/shared/ui/data/DataTable.test.tsx`
- Test: `frontend/src/shared/ui/overlays/Modal.test.tsx`

**Interfaces:**
- `DataTable<T>({ columns, data, rowKey, loading, empty, onRowClick })` supports keyboard-accessible rows and explicit loading/empty/error slots.
- `StatusBadge({ status, label })` always renders text; color is supplementary.
- `Modal({ open, title, onClose, children, size })` manages focus, Escape and background inertness.
- `Tabs({ items, value, onChange })` exposes selected state through `aria-selected` and keyboard navigation.

- [ ] **Step 1: Write failing accessibility tests**

Verify dialog semantics, focus return, Escape close, table headers, keyboard row activation, and status text independent of color.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
npm test -- --run src/shared/ui/data/DataTable.test.tsx src/shared/ui/overlays/Modal.test.tsx
```

- [ ] **Step 3: Implement the minimal primitives**

Use Radix behavior where appropriate and style through SIGAT tokens. Do not add business labels or equipment rules to shared components.

- [ ] **Step 4: Add visual state styles**

Implement loading skeleton, retry action, empty state with next action, and error state with a nontechnical message plus a details hook for logs.

- [ ] **Step 5: Run tests, build and keyboard smoke check**

```bash
npm test -- --run
npm run build
```

Manually confirm focus is visible in the modal, tabs and table actions.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/ui
git commit -m "feat: add accessible shared data components"
```

### Task 6: Dashboard da Unidade

**Files:**
- Create: `frontend/src/features/dashboard/components/UnitMetricCards.tsx`
- Create: `frontend/src/features/dashboard/components/EquipmentSituationSummary.tsx`
- Create: `frontend/src/features/dashboard/components/RecentActivity.tsx`
- Create: `frontend/src/features/dashboard/pages/UnitDashboardPage.test.tsx`
- Modify: `frontend/src/features/dashboard/pages/UnitDashboardPage.tsx`
- Modify: `frontend/src/features/dashboard/api/dashboardApi.ts`
- Modify: `frontend/src/shared/ui/layout/AppShell.tsx`

**Interfaces:**
- `UnitDashboard = { unit: UnitContext; metrics: { total: number; active: number; maintenance: number; attention: number }; situations: SituationCount[]; recentActivity: Activity[] }`.
- `getUnitDashboard(): Promise<UnitDashboard>` obtains the scope from the authenticated session; it does not accept a unit id from the page.

- [ ] **Step 1: Write failing page tests**

Cover rendering of Unit name, total equipment, attention metric, recent activity, loading and API error retry. Assert that the page does not render a DITEL statewide control.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
npm test -- --run src/features/dashboard/pages/UnitDashboardPage.test.tsx
```

- [ ] **Step 3: Implement the dashboard query and metric components**

Use TanStack Query and the shared states. Metrics are descriptive and must not imply SIGAT manages the external maintenance system.

- [ ] **Step 4: Add responsive layout**

Use a desktop grid with clear equipment-first hierarchy. Stack cards and summaries on tablet/mobile without hiding the current Unit context.

- [ ] **Step 5: Run tests and build**

```bash
npm test -- --run
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/dashboard frontend/src/shared/ui/layout/AppShell.tsx
git commit -m "feat: add unit dashboard vertical slice"
```

### Task 7: Inventário da Unidade com filtros e modal de equipamento

**Files:**
- Create: `frontend/src/features/inventory/types.ts`
- Create: `frontend/src/features/inventory/components/InventoryToolbar.tsx`
- Create: `frontend/src/features/inventory/components/InventoryTable.tsx`
- Create: `frontend/src/features/inventory/components/EquipmentDetailsModal.tsx`
- Create: `frontend/src/features/inventory/components/EquipmentDetailsTabs.tsx`
- Create: `frontend/src/features/inventory/pages/UnitInventoryPage.tsx`
- Create: `frontend/src/features/inventory/pages/UnitInventoryPage.test.tsx`
- Create: `frontend/src/features/inventory/components/EquipmentDetailsModal.test.tsx`
- Modify: `frontend/src/features/inventory/api/inventoryApi.ts`
- Modify: `frontend/src/app/routes.tsx`

**Interfaces:**
- `InventoryFilters = { search: string; type: string; model: string; situation: string; page: number; pageSize: number }`.
- `EquipmentDetails = EquipmentSummary & { serialNumber?: string; category: string; warranty?: string; responsibleUser?: string; history: EquipmentHistoryEntry[]; linkedTicketCount: number }`.
- `getEquipmentDetails(id: string): Promise<EquipmentDetails>` validates the id server-side and applies Unit scope.
- `EquipmentDetailsModal({ equipmentId, open, onClose, onOpenTicket })` exposes a single `Abrir chamado` action for the next tickets plan.

- [ ] **Step 1: Write failing inventory and modal tests**

Cover:

```tsx
test('persists type and model filters in the URL', () => {
  // render route with MemoryRouter and apply filters
  // expect searchParams.get('type') and searchParams.get('model')
})

test('opens equipment details with tabs and a single ticket action', () => {
  // expect summary, technical data, history, linked tickets and Abrir chamado
})
```

Also test that a Unit user never sees a Unit selector, that filters are sent to the API, and that modal content becomes full-screen below the mobile breakpoint.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
npm test -- --run src/features/inventory/pages/UnitInventoryPage.test.tsx src/features/inventory/components/EquipmentDetailsModal.test.tsx
```

- [ ] **Step 3: Implement URL-backed filters**

Parse and serialize only allowed filters. Debounce free-text search, reset page to 1 when a filter changes and use server pagination. Type and model are the principal filters; advanced filters remain behind `Filtros`.

- [ ] **Step 4: Implement the equipment table**

Columns: patrimônio, tipo, marca/modelo, situação, localização/responsável, última atualização and action to view details. Use text plus color for situations and preserve keyboard access.

- [ ] **Step 5: Implement the modal and tabs**

Tabs: `Resumo`, `Dados técnicos`, `Histórico` and `Chamados`. Do not create an exclusive `Anexos` tab. Keep status, equipment identity, Unit context and primary actions visible. On mobile the modal occupies the viewport.

- [ ] **Step 6: Add the ticket handoff boundary**

The button emits `onOpenTicket(equipmentId)` and navigates to `/chamados/novo?equipmentId=<id>`. Until the dedicated Chamados plan is executed, that route renders a real boundary state with the title `Abertura de chamado`, the selected equipment patrimony, the message `O fluxo de chamados será conectado na próxima etapa.` and a `Voltar ao inventário` action; it must not claim to save or send a ticket.

- [ ] **Step 7: Run tests, build and browser smoke test**

```bash
npm test -- --run
npm run build
npm run dev -- --host 127.0.0.1
```

Verify desktop table, tablet filter wrapping, mobile cards/modal, URL refresh persistence and keyboard operation.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/inventory frontend/src/app/routes.tsx
git commit -m "feat: add unit inventory and equipment details"
```

### Task 8: Quality gate and handoff

**Files:**
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/unit-flow.spec.ts`
- Create: `frontend/src/test/setup.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.ts`
- Create: `docs/frontend-implementation-notes.md`

**Interfaces:**
- E2E fixture starts the MSW-backed application and navigates as `unit_user`.
- CI/local quality command is `npm run verify`, running typecheck, unit tests, build and Playwright.

- [ ] **Step 1: Write the end-to-end scenario**

The scenario must log in with fixture matrícula, reach the Unit dashboard, open Inventário, filter by type/model, open a radio equipment modal, switch tabs and verify `Abrir chamado` is present.

- [ ] **Step 2: Run the scenario before final wiring**

```bash
npm run test:e2e -- e2e/unit-flow.spec.ts
```

Expected: FAIL until the complete route and fixture wiring is available.

- [ ] **Step 3: Wire the test setup and verification script**

Add `typecheck`, `test:e2e` and `verify` scripts. Configure Playwright to use the Vite preview server and a deterministic base URL.

- [ ] **Step 4: Run the complete gate**

```bash
npm run verify
```

Expected: TypeScript, unit tests, production build and end-to-end flow all pass.

- [ ] **Step 5: Review the generated build**

Confirm `dist/` contains hashed assets, no environment secret is embedded, and only `VITE_` public configuration is present.

- [ ] **Step 6: Commit**

```bash
git add frontend docs/frontend-implementation-notes.md
git commit -m "test: add frontend foundation quality gate"
```

## Plan Self-Review

- Spec coverage: architecture, Debian deployment, React/Vite stack, two profiles, top navigation, responsive behavior, security, tests, inventory-first Unit flow and equipment modal are covered by Tasks 1-8.
- Scope boundary: Chamados, Movimentações, Relatórios, DITEL administration and real backend endpoints remain separate follow-up plans.
- Security boundary: permission checks are represented in the frontend but remain authoritative in the future API.
- Placeholder scan: no implementation step depends on an undefined function; all interfaces used by later tasks are defined in the task that produces them.
- Type consistency: `SessionContext`, `EquipmentSummary`, `InventoryQuery`, `InventoryResponse`, `InventoryFilters` and `EquipmentDetails` are named once and reused consistently.
- Validation: every task includes a focused test, a command, an expected result and a commit checkpoint.

## Deferred Follow-up Plans

1. Real Node.js API, MongoDB models, authentication and authorization.
2. Chamados with automatic Suporte/Telecom routing, attachments and mandatory review.
3. Movimentações with approval/rejection and confirmation.
4. DITEL statewide dashboard, administration and audit.
5. PDF report preview/export and production deployment with HTTPS.
