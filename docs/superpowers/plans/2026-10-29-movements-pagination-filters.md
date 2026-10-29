# Movements Pagination and Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Paginate and filter the supported definitive-transfer movement list in the database and connect the real contract to the movement center.

**Architecture:** Extend the existing `listMovements` repository query with validated pagination and filters, applying role scope before counting and fetching. Keep the existing movement mutation routes untouched. Update the frontend API client and page to request server-side filters, preserve page state, discard stale responses, and show only supported transfer filters.

**Tech Stack:** TypeScript, Express, Mongoose, React, Vitest, Testing Library, OpenAPI.

**Spec:** ATIVUS 2.0 — Etapa 3.2 user request.

## Global Constraints

- No production writes, migrations, Atlas index changes, Render/GitHub changes, commit, push, or deploy.
- Preserve Etapa 3.1, Etapa 2.7, and Fases 7/8 local changes.
- Do not alter custody, locks, transactions, or audit rules.
- Do not expose allocation or disposal as supported movement types.

## Review Focus

- Invalid and excessive pagination parameters return a controlled 400 response.
- Unit scope is applied before `countDocuments` and `find`.
- Equal timestamps retain deterministic `_id` ordering.
- Empty and out-of-range pages render without stale previous results.
- A slower previous filter request cannot overwrite a newer filter response.

### Task 1: Backend paginated movement query

Files: `backend/src/repositories/movementsRepository.ts`, `backend/src/routes/movementRoutes.ts`, `backend/src/routes/movementRoutes.test.ts`.

Add query types for `page`, `pageSize`, `status`, `unitId`, `search`, `from`, and `to`; validate them in the route; apply role scope and supported transfer type before count/list; sort `{ createdAt: -1, _id: 1 }`; return `{ items, total, page, pageSize, totalPages }` with a bounded page size.

### Task 2: Frontend contract and server-side filters

Files: `frontend/src/features/movements/api/movementsApi.ts`, its tests, `frontend/src/features/movements/pages/MovementsPage.tsx`, its tests, `frontend/src/shared/api/contracts.ts` if needed.

Add typed query/response handling, remove unsupported allocation/disposal controls and fixture injection, reset page on filter changes, preserve filters on pagination, and guard requests against stale responses.

### Task 3: OpenAPI and verification

Files: `docs/api/openapi.yaml` and focused tests as needed.

Document the paginated response and query parameters, then run focused/full backend and frontend tests, typechecks, builds, and `git diff --check`.
