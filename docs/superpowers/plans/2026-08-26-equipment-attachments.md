# Equipment Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a functional, frontend-only attachment step to equipment registration and show simulated document metadata in equipment details.

**Architecture:** Reuse the existing call attachment validation pattern, extracting equipment-specific rules into a focused inventory attachment module. Keep selected `File` objects in the modal draft and convert them to simulated metadata on confirmation; no backend, physical storage, or real download is introduced.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, MSW, existing SIGAT CSS tokens.

**Spec:** `docs/superpowers/specs/2026-08-26-equipment-attachments-design.md`

## Global Constraints

- Accepted types: PDF, JPG and PNG.
- Maximum five files per equipment.
- Maximum 15 MiB per file (`15 * 1024 * 1024` bytes).
- Attachments are optional.
- Download remains visual/inactive in this frontend-only phase.

### Task 1: Attachment validation and draft contracts

**Files:**
- Create: `frontend/src/features/inventory/api/equipmentAttachments.ts`
- Modify: `frontend/src/shared/api/contracts.ts`
- Test: `frontend/src/features/inventory/api/equipmentAttachments.test.ts`

- [ ] Write failing tests for valid PDF/JPG/PNG, rejection of WEBP/DOCX, 15 MiB boundary, sixth file, and conversion to metadata.
- [ ] Run `npm test -- --run frontend/src/features/inventory/api/equipmentAttachments.test.ts`; confirm failure.
- [ ] Implement typed `EquipmentAttachmentDraft`, `EquipmentDocumentMetadata`, `validateEquipmentAttachments(files)`, and `toEquipmentDocumentMetadata(file, index)`.
- [ ] Run the focused test and confirm it passes.

### Task 2: Attachment step in registration modal

**Files:**
- Modify: `frontend/src/features/inventory/components/EquipmentRegistrationModal.tsx`
- Modify: `frontend/src/shared/styles/inventory.css`
- Test: `frontend/src/features/inventory/components/EquipmentRegistrationModal.test.tsx`

- [ ] Add failing tests for the Anexos step, file selection, visible filename/type/size, removal, validation errors, five-file limit, and optional empty state.
- [ ] Run the focused test; confirm failure.
- [ ] Add the step before review with accessible file input, drag/drop handlers, live error region, and per-item remove buttons.
- [ ] Preserve the existing registration fields and review flow; pass selected metadata through the existing confirmation callback.
- [ ] Add compact responsive styles consistent with the current dark inventory modal.
- [ ] Run focused tests; confirm pass.

### Task 3: Simulated persistence and details display

**Files:**
- Modify: `frontend/src/features/inventory/pages/UnitInventoryPage.tsx`
- Modify: `frontend/src/features/inventory/components/EquipmentDetailModal.tsx`
- Modify: `frontend/src/shared/api/msw/handlers.ts`
- Modify: `frontend/src/features/inventory/components/EquipmentDetailModal.visual.test.tsx`

- [ ] Add a failing test proving confirmed attachment metadata is associated with the created equipment and appears under Documentos vinculados.
- [ ] Run the focused test; confirm failure.
- [ ] Store only simulated metadata in the existing frontend/MSW state; keep `File` objects confined to the open form.
- [ ] Render name, type, size and date; disable or label the download action as unavailable in this phase.
- [ ] Run focused tests; confirm pass.

### Task 4: Regression verification and local preview

**Files:**
- Modify only files required by failures from Tasks 1–3.

- [ ] Run `npm run verify` from `frontend` and confirm tests, typecheck, and build pass.
- [ ] Open `http://127.0.0.1:5173/inventario`, exercise the registration modal, select valid/invalid files, review, confirm, and inspect details.
- [ ] Verify responsive behavior at a narrow viewport and confirm no real download or backend request is implied.
