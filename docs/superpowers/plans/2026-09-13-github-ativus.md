# ATIVUS GitHub Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar e publicar com segurança o projeto ATIVUS em um repositório GitHub privado, sem incluir segredos, dados locais ou artefatos gerados.

**Architecture:** O código-fonte permanece no repositório raiz, enquanto dependências instaladas, builds, bancos locais, backups, logs, PDFs renderizados e caches ficam ignorados. A publicação só ocorre após uma inspeção do staging e validação final.

**Tech Stack:** Git, GitHub CLI (`gh`), PowerShell, Node.js/npm, backend Express/TypeScript, frontend React/Vite/TypeScript.

**Spec:** `AGENTS.md`, `Documents/SIGAT-Especificacao-Oficial-v0.1.md`, `docs/api/openapi.yaml`.

## Global Constraints

- Não publicar segredos, senhas, tokens, hashes, cookies, dumps ou credenciais.
- Não incluir `node_modules`, `dist`, `var`, bancos locais, arquivos `.wt`, logs, caches ou PDFs renderizados.
- Não apagar dados do usuário; apenas ignorar artefatos no Git.
- O repositório GitHub será privado e terá o nome `ATIVUS`.
- Não alterar runtime nesta etapa, salvo correções necessárias para impedir vazamento de segredo.
- Executar testes reais antes do commit e registrar somente resultados observados.

---

### Task 1: Inventariar e proteger arquivos locais

**Files:**
- Create or modify: `.gitignore`
- Inspect: `.env`, `.env.*`, `backend/var`, `backend/dist`, `frontend/dist`, `tmp`, `output`, `graphify-out`, `.claude`, `.swarm`

- [x] **Step 1: Confirmar o estado do repositório sem staging**

Run `git status --short` and `git check-ignore -v .env backend/.env frontend/.env backend/var frontend/dist`.

- [x] **Step 2: Criar regras de exclusão**

Adicionar ao `.gitignore` regras para `.env*` com exceção de `.env.example`, `node_modules/`, `dist/`, `coverage/`, `*.tsbuildinfo`, `backend/var/`, `tmp/`, `output/`, dumps MongoDB, arquivos `.wt`, logs e caches de ferramentas.

- [x] **Step 3: Verificar que arquivos de exemplo não contêm segredos**

Executar busca textual por `passwordHash`, senhas, tokens, `MONGODB_URI` com credencial, chaves privadas e cookies nos arquivos que serão versionados. Se houver segredo real, removê-lo do conteúdo versionado sem apagar o arquivo local original; criar ou atualizar apenas o exemplo sanitizado.

- [x] **Step 4: Confirmar o resultado**

Run `git status --short --ignored` and verify that generated/local files are ignored while source, tests, OpenAPI and package lockfiles remain candidates for versioning.

### Task 2: Validar o código antes do commit

**Files:**
- Inspect only: backend, frontend, `docs/api/openapi.yaml`

- [ ] **Step 1: Executar backend**

Run from `backend/`: `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`, `npm audit --omit=dev`.

- [ ] **Step 2: Executar frontend**

Run from `frontend/`: `npm run typecheck`, `npm test -- --run`, `npm run build`, `npm audit --omit=dev`, `npx playwright test --project=chromium`.

- [ ] **Step 3: Validar contrato**

Run from the repository root: `npx --yes @redocly/cli@1.34.0 lint docs/api/openapi.yaml`.

- [ ] **Step 4: Parar se qualquer comando falhar**

Registrar o comando, erro e arquivo relacionado; não criar commit nem publicar enquanto houver falha.

### Task 3: Configurar identidade e autenticação GitHub

**Files:**
- No source files.

- [ ] **Step 1: Confirmar identidade local**

Run `git config user.name` and `git config user.email`. If either is empty, configure the values supplied by the owner; never invent them.

- [ ] **Step 2: Confirmar autenticação GitHub**

Run `gh auth status`. If unauthenticated, run `gh auth login` interactively with HTTPS and the owner’s browser/device confirmation.

- [ ] **Step 3: Confirmar conta e destino**

Run `gh repo list --limit 100` and ensure there is no existing repository with the selected owner/name `ATIVUS` before creation.

### Task 4: Preparar e inspecionar o commit inicial

**Files:**
- All intended source, test, documentation and lockfiles.

- [ ] **Step 1: Stage only tracked project content**

Run `git add .` only after Task 1, then inspect `git status --short` and `git diff --cached --stat`.

- [ ] **Step 2: Scan the staged snapshot**

Run searches against staged content for `passwordHash`, token fields, private keys, `.env` values, Mongo credentials, cookies, `storageKey` and large generated files. Remove any accidental staged artifact with `git restore --staged -- <explicit-path>`; do not delete the working file.

- [ ] **Step 3: Review sensitive file names and size**

Use `git diff --cached --name-only` and `git diff --cached --numstat`. Reject the staging set if it contains local databases, backups, logs, generated output or unexpected user data.

- [ ] **Step 4: Create the initial commit**

Only after the staged review is clean, run `git commit -m "chore: initial ATIVUS release"`.

### Task 5: Create the private GitHub repository and publish

**Files:**
- Remote Git configuration only.

- [ ] **Step 1: Create the private repository**

Run `gh repo create ATIVUS --private --source . --remote origin --push` only after Tasks 1–4 pass and the owner identity is confirmed.

- [ ] **Step 2: Verify remote and branch**

Run `git remote -v`, `git branch --show-current`, `git log -1 --oneline`, and `gh repo view --web` or `gh repo view`.

- [ ] **Step 3: Verify repository visibility and contents**

Run `gh repo view --json nameWithOwner,isPrivate,defaultBranchRef` and confirm `isPrivate: true`, repository name `ATIVUS`, and only intended files are present.

- [ ] **Step 4: Do not configure deployment yet**

Do not add production secrets, CI deployment, domain, HTTPS, CORS origins or PuTTY server configuration in this plan. Those belong to the later infrastructure phase.

### Task 6: Final handoff

- [ ] Report repository URL, visibility, commit identifier, validation results and excluded artifact categories.
- [ ] Report any remaining infrastructure work: real environment variables, Mongo backup/migration/seed, server deployment, HTTPS/TLS, CORS and smoke test in the hosted environment.

## Acceptance Criteria

- The remote repository is private and named `ATIVUS`.
- No secrets, local databases, backups, generated artifacts or internal runtime data are in the initial commit.
- Backend tests, integration, typecheck, build and audit pass.
- Frontend tests, typecheck, build, Chromium E2E and audit pass.
- OpenAPI/Redocly validation passes.
- The deployment environment remains untouched until its separate preparation phase.
