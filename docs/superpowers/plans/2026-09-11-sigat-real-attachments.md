# SIGAT Real Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement authenticated local attachments for equipment and calls, replacing the current unsupported/mock attachment boundary with protected upload and download.

**Architecture:** Store file bytes through a small `AttachmentStorage` interface backed by local disk outside any public frontend/build directory. Persist only metadata on `Equipment` and `Call` documents; expose only public metadata and download through authenticated, scoped routes. On persistence or validation failure after writing a file, delete only files written during that request.

**Tech Stack:** Express, Multer memory storage, Mongoose, local filesystem storage, React, TypeScript, MSW, Vitest, Playwright, OpenAPI/Redocly.

**Spec:** `docs/superpowers/specs/2026-08-26-equipment-attachments-design.md`, upgraded by current delegation decision to backend-backed storage.

## Global Constraints

- No Git.
- Do not delete existing equipment/call data.
- Local storage must sit behind a replaceable interface and outside public assets.
- Upload validation must enforce per-file size and MIME/extension allowlist.
- File names on disk must be random, not derived from user input.
- Download must be authenticated and scoped to the owning unit or DITEL statewide access.
- Public API responses must not expose file paths, storage keys, password/hash/tokens/sessionId, or file content.
- Conservative retention: keep active attachments indefinitely until an explicit future retention/deletion policy exists; perform cleanup only for files written during a failed request.

## Tasks

### Task 1: Backend storage and metadata model

**Files:**
- Create: `backend/src/storage/attachmentStorage.ts`
- Create: `backend/src/services/attachments.ts`
- Modify: `backend/src/models/Equipment.ts`
- Modify: `backend/src/models/Call.ts`
- Test: `backend/src/routes/inventoryCreateRoutes.test.ts`, `backend/src/routes/callsRoutes.test.ts`

**TDD steps:**
- [ ] Add RED tests for valid upload metadata, invalid MIME/extension, file size, random/non-public storage path, and cleanup on failed persistence.
- [ ] Implement `AttachmentStorage` and `LocalAttachmentStorage`, allowed file rules, metadata serialization, and schemas.
- [ ] Re-run focused tests to GREEN.

### Task 2: Backend upload/download routes

**Files:**
- Modify: `backend/src/routes/inventoryRoutes.ts`
- Modify: `backend/src/routes/callsRoutes.ts`
- Create: `backend/src/routes/attachmentRoutes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/repositories/equipmentReadRepository.ts`
- Modify: `backend/src/repositories/callsRepository.ts`

**TDD steps:**
- [ ] Add RED tests proving unit users can download only own attachments and DITEL can download statewide call/equipment attachments.
- [ ] Implement scoped lookup and `GET /api/v1/attachments/:attachmentId/download`.
- [ ] Re-run focused tests to GREEN and confirm responses do not expose secrets or local paths.

### Task 3: Frontend contracts and UI integration

**Files:**
- Modify: `frontend/src/shared/api/contracts.ts`
- Modify: `frontend/src/features/inventory/api/inventoryApi.ts`
- Modify: `frontend/src/features/inventory/components/EquipmentRegistrationModal.tsx`
- Modify: `frontend/src/features/inventory/components/EquipmentDetailModal.tsx`
- Modify: `frontend/src/features/inventory/components/EquipmentDetailTabs.tsx`
- Modify: `frontend/src/features/calls/api/callsApi.ts`
- Modify: `frontend/src/features/calls/components/CallDetailModal.tsx`
- Modify: `frontend/src/shared/api/msw/handlers.ts`

**TDD steps:**
- [ ] Add RED frontend tests for equipment upload/review/download metadata and call attachment detail/download metadata.
- [ ] Wire existing attachment UI to real `FormData` uploads and authenticated download endpoints, preserving layout.
- [ ] Add loading/error/retry only in existing detail flows.
- [ ] Re-run focused tests to GREEN.

### Task 4: OpenAPI, E2E, and verification

**Files:**
- Modify: `docs/api/openapi.yaml`
- Modify: `backend/src/openapi.test.ts`
- Modify/add E2E tests under `frontend/e2e/`.

**TDD steps:**
- [ ] Add contract assertions for attachment metadata and download route.
- [ ] Add E2E coverage for uploading/downloading allowed attachments in inventory and calls.
- [ ] Run focused and full backend/frontend tests, typechecks, builds, integration, E2E, audits, and Redocly.
