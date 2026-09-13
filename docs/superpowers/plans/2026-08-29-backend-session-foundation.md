# Backend Session Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a primeira fatia vertical do backend do SIGAT com login, sessão persistida, logout e contexto de sessão compatível com o frontend.

**Architecture:** API Node.js/TypeScript separada do frontend, versionada em `/api/v1`, com MongoDB como persistência. Sessões opacas serão armazenadas no MongoDB e referenciadas por cookie HttpOnly; a API será responsável por autenticação, autorização, escopo e auditoria.

**Tech Stack:** Node.js LTS, TypeScript, API HTTP REST, MongoDB, Mongoose, Vitest e Supertest; instalação direta no Debian, sem Docker.

**Spec:** `Documents/SIGAT-Especificacao-Oficial-v0.1.md`, `docs/api/openapi.yaml` e `C:/Users/alanp/Downloads/sigat-arquitetura-fundacao-frontend.pdf`

## Global Constraints

- Manter frontend e backend separados.
- Usar o prefixo `/api/v1`.
- Usar cookie `sigat_session` com HttpOnly, Secure e SameSite=Lax.
- Não armazenar token sensível em localStorage.
- Validar autenticação e autorização no servidor.
- Registrar login, logout e falhas de autenticação em auditoria.
- Não implementar ainda inventário, chamados, relatórios ou migração de bibliotecas do frontend.
- Manter a sessão ativa até logout na primeira versão; expiração por inatividade será requisito antes da exposição externa.

### Task 1: Criar o esqueleto executável da API

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/src/app.ts`
- Create: `backend/src/server.ts`
- Create: `backend/src/config/env.ts`
- Test: `backend/src/app.test.ts`

**Interfaces:**
- Produces: `createApp(): Express` e rota `GET /api/v1/health` retornando `{ status: "ok" }`.

- [ ] Escrever teste que chama `GET /api/v1/health` e espera HTTP 200.
- [ ] Executar o teste e confirmar falha por arquivos ausentes.
- [ ] Criar a aplicação Express com parser JSON, rota de health e tratamento básico de erro.
- [ ] Executar o teste e confirmar aprovação.
- [ ] Criar scripts `typecheck`, `test`, `build` e `dev` com dependências fixadas no lockfile.
- [ ] Executar typecheck e build.

### Task 2: Adicionar conexão MongoDB e modelos de usuário, sessão e auditoria

**Files:**
- Create: `backend/src/database/mongoose.ts`
- Create: `backend/src/models/User.ts`
- Create: `backend/src/models/Session.ts`
- Create: `backend/src/models/AuditEvent.ts`
- Create: `backend/src/repositories/usersRepository.ts`
- Create: `backend/src/repositories/sessionsRepository.ts`
- Create: `backend/src/repositories/auditRepository.ts`
- Test: `backend/src/repositories/*.test.ts`

**Interfaces:**
- `findActiveUserByRegistration(registration: string)` retorna usuário ativo sem senha.
- `createSession(userId: string)` retorna identificador opaco de sessão.
- `findSession(sessionId: string)` retorna sessão não revogada.
- `revokeSession(sessionId: string)` invalida a sessão.
- `recordAuditEvent(input)` persiste ação, usuário, resultado e data.

- [ ] Escrever testes de repositório para usuário ativo/inativo, sessão criada/revogada e auditoria.
- [ ] Executar os testes com banco de teste configurado e confirmar falhas esperadas.
- [ ] Implementar schemas Mongoose, índices de matrícula, sessão e data de auditoria.
- [ ] Garantir que senhas sejam armazenadas somente como hash Argon2id ou bcrypt.
- [ ] Executar os testes e confirmar aprovação.

### Task 3: Implementar autenticação e política de cookie

**Files:**
- Create: `backend/src/auth/password.ts`
- Create: `backend/src/auth/sessionService.ts`
- Create: `backend/src/middlewares/requireSession.ts`
- Create: `backend/src/routes/authRoutes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/routes/authRoutes.test.ts`

**Interfaces:**
- `POST /api/v1/auth/login` recebe `{ registration, password }` e retorna `SessionContext`.
- `GET /api/v1/session` retorna `SessionContext`.
- `POST /api/v1/auth/logout` retorna HTTP 204.
- Falhas retornam `{ code, message, details? }` sem revelar se a matrícula existe.

- [ ] Escrever testes para login válido, credencial inválida, usuário bloqueado, sessão consultável, logout e sessão revogada.
- [ ] Executar os testes e confirmar que falham antes da implementação.
- [ ] Implementar cookie `sigat_session` com `httpOnly: true`, `sameSite: 'lax'`, `secure` controlado por ambiente e `path: '/'`.
- [ ] Implementar invalidação no logout e auditoria de sucesso/falha.
- [ ] Executar testes de autenticação e confirmar aprovação.

### Task 4: Integrar o primeiro endpoint protegido ao contrato

**Files:**
- Create: `backend/src/routes/dashboardRoutes.ts`
- Create: `backend/src/middlewares/authorization.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/routes/dashboardRoutes.test.ts`
- Modify: `docs/api/openapi.yaml` somente se o schema real divergir do contrato aprovado.

**Interfaces:**
- `GET /api/v1/dashboard` exige sessão e retorna o shape `DashboardResponse` do OpenAPI.
- O contexto retornado por `/session` é a única fonte de perfil e unidade para autorização.

- [ ] Escrever testes para acesso sem sessão, usuário de unidade e administrador DITEL.
- [ ] Executar os testes e confirmar falhas.
- [ ] Implementar middleware de sessão e resposta dashboard mínima baseada no escopo autenticado.
- [ ] Executar testes, typecheck e build.
- [ ] Validar o OpenAPI e conferir que os endpoints implementados continuam compatíveis.

### Task 5: Verificação integrada e documentação operacional

**Files:**
- Create: `backend/.env.example`
- Create: `backend/README.md`
- Modify: `Documents/SIGAT-Especificacao-Oficial-v0.1.md` somente para registrar o status executado, sem alterar decisões aprovadas.

- [x] Executar a suíte completa do backend.
- [x] Executar typecheck e build.
- [x] Executar a suíte existente do frontend para detectar regressões de contrato.
- [x] Validar `docs/api/openapi.yaml`.
- [x] Documentar variáveis `MONGODB_URI`, `SESSION_COOKIE_SECURE`, `PORT` e `NODE_ENV`.
- [x] Registrar limitações: sem expiração por inatividade, sem CSRF integrado ao frontend e sem implantação Debian nesta etapa.
