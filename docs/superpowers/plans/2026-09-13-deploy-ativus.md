# Plano Para OpenCode: Deploy ATIVUS — Execução 13/09/2026

**Executor:** Jarvis via 9Router (guia "OpenCode" no texto = Jarvis/Hermes, conforme esclarecimento do usuário)

## Status de execução

### Fase 1 — Auditoria Pré-Deploy ✅
- git status limpo, remote origin = github.com/AlanPatrickPaesSantos/ATIVUS, log 3 commits (ba57253, 619888e, 11a43d3, 04b8d0f)
- Backend: typecheck ✅ · 217/217 ✅ · integração 2/2 ✅ · build ✅ · audit 0 ✅
- Frontend: typecheck ✅ · 240/240 ✅ · build ✅ · audit 0 ✅ · Playwright 21/21 ✅
- Redocly openapi.yaml: válido ✅

### Achados da auditoria (pré-infra)
- `dist/server.js` existe (entrypoint OK para Render start `node dist/server.js`)
- `GET /api/v1/health` existe (app.ts:108) → `{status:'ok'}`; também `/api/v1/readiness`
- `ops:homolog:verify` = somente-leitura (verify/report) — seguro para Atlas
- `ops:homolog:bootstrap` sem `--seed-non-prod` cria índices (seguro); seed bloqueado se NODE_ENV=production (homologation.ts:148)
- **Anexos ficam em disco local** (`var/attachments` via `LocalAttachmentStorage`, env `SIGAT_ATTACHMENT_STORAGE_DIR`) → Render free = filesystem efêmero → **PENDÊNCIA OPERACIONAL** (anexos serão perdidos em redeploy/dormência)
- Config de env mapeada (src/config/env.ts): PORT, MONGODB_URI, SESSION_COOKIE_SECURE, ALLOWED_ORIGINS (CSV), TTLs, rate limits

### Correções de build para Render (prod-only)
Problema identificado e corrigido: `npm ci` com `NODE_ENV=production` omite devDependencies, mas o `tsc -p` compilava arquivos de teste (`.test.ts`) que importam `vitest`, `supertest`, `mongodb-memory-server`.

- **backend/tsconfig.json**: removido `"vitest/globals"` dos `types` e adicionado `"exclude": ["src/**/*.test.ts", "src/integration"]` → build sobe sem devDeps, typecheck local continua OK (217/217)
- **frontend/tsconfig.app.json**: removido `"vitest/globals"` dos `types` e adicionado `"exclude": ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.spec.ts", "src/**/*.spec.tsx", "src/e2e"]` → build sobe sem devDeps, typecheck local continua OK (240/240)
- Ambas correções commitadas (619888e) e pushadas.

### Fase 2 — MongoDB Atlas ✅ (cluster criado por usuário)
- Cluster ATIVUS (M0 Free) criado
- Database User `ativus_app` com senha guardada (não exposta)
- Connection string guardada localmente (não logada)
- Network Access liberado (0.0.0.0/0 por enquanto — risco operacional registrado)

### Fase 3 — Render Backend ✅ (criado por usuário)
- Web Service `ativus` criado por usuário
- Variáveis de ambiente configuradas (NODE_ENV, PORT=10000, MONGODB_URI, SESSION_COOKIE_SECURE=true, ALLOWED_ORIGINS=https://ativus-frontend.onrender.com, TTLs, rate limits)
- **Erro TS2688 corrigido** → push ba57253 com tsconfig excludes
- **Backend Live e respondendo:** health check OK (`https://ativus.onrender.com/api/v1/health`)

### Fase 4 — Render Frontend ✅ (criado por usuário)
- Static Site `ativus-frontend` criado por usuário
- Variáveis de ambiente configuradas (VITE_API_BASE_URL=https://ativus.onrender.com/api/v1, VITE_ENABLE_MSW=false)
- Config Updates escritos (ALLOWED_ORIGINS já atualizado no backend)
- **Frontend UP:** serving HTML do SIGAT corretamente

### Fase 5 — Banco, Migration, Índices e Primeiro Usuário ✅
- ops:homolog:verify (dry run) → Mongo ready: yes, Transaction support: supported, Indexes ready: no → corrigido
- ops:homolog:bootstrap → índices criados (AuditEvent: 7, Mission: 2, Unit: 1) → Indexes ready: yes
- MONGODB_URI atualizada para incluir `/ativus`
- **Primeiro admin DITEL criado:** ADMIN / matrícula ADMIN / senha gerada `senha omitida (rotacionada 14/09)` (mustChangePassword: true)
- **Usuário de unidade criado:** Teste Unit / matrícula UNIT001 / senha SENHA ROTACIONADA — removida do histórico / unidade "unidade-teste"
- **Unidade criada:** unidade-teste / Unidade Teste / UT

### Fase 6 — Smoke Test Final Hosted ✅
- Health check backend: ✅ `https://ativus.onrender.com/api/v1/health` → {"status":"ok"}
- Health check frontend: ✅ `https://ativus-frontend.onrender.com` → HTML do SIGAT servido
- Login admin DITEL: ✅ POST /api/v1/auth/login → sessão criada, cookie HttpOnly
- Password change obrigatório: ✅ POST /api/v1/auth/password-change → mustChangePassword removido
- Criação de usuários admin: ✅ POST /api/v1/admin/users (admin DITEL + unit_user)
- Criação de unidades: ✅ via inserção direta (unitRoutes só GET)
- Login unit_user: ✅ POST /api/v1/auth/login → sessão com unit scope
- CORS: ✅ Origin `https://ativus-frontend.onrender.com` aceita pelo backend
- Session persistence: ✅ GET /api/v1/session com cookie → contexto válido

### Fase 7 — Ajustes Render Free Plan [PENDENTE - OPERACIONAL]
- Fix attachments (LocalAttachmentStorage não persiste em Render free) → migrar para solução externa se necessário (S3/Blob Storage)
- Whitelist Atlas: restringir 0.0.0.0/0 para IPs específicos quando possível

### Fase 8 — Entrega Final do OpenCode ✅

## Entregas confirmadas
| Item | Status | Evidência |
|------|--------|-----------|
| Backend no Render | ✅ UP | https://ativus.onrender.com/api/v1/health → {"status":"ok"} |
| Frontend no Render | ✅ UP | https://ativus-frontend.onrender.com → HTML SIGAT |
| MongoDB Atlas conectado | ✅ | MONGODB_URI com /ativus, whitelist 0.0.0.0/0 |
| CORS configurado | ✅ | ALLOWED_ORIGINS=https://ativus-frontend.onrender.com |
| Índices criados | ✅ | ops:homolog:bootstrap → zero missing |
| Admin DITEL | ✅ | ADMIN / senha omitida (rotacionada 14/09) (mustChangePassword=true) |
| Unit user | ✅ | UNIT001 / SENHA ROTACIONADA — removida do histórico / unidade-teste |
| Auth flow | ✅ | login → password-change → session → admin/users |
| CORS preflight | ✅ | OPTIONS /api/v1/auth/login 200 OK |

## Pendências operacionais (não-bloqueantes)
1. **Attachments**: LocalAttachmentStorage usa disco local → arquivos perdidos em redeploy/dormência. Recomenda migrar para S3/Blob Storage + variável `SIGAT_ATTACHMENT_STORAGE_DIR`.
2. **Atlas Whitelist**: 0.0.0.0/0 é risco. Restringir a IPs do Render (ou VPC peering) quando possível.
3. **Backup Atlas**: configurar backup contínuo/PITR se migrar para tier dedicado (M0 não tem).
4. **Domínio customizado**: opcional — configurar domínio próprio no Render.

## Resumo final
**DEPLOY APROVADO** ✅
- Backend + Frontend no Render (Free tier)
- MongoDB Atlas (M0 Free)
- Autenticação e autorização funcionando (ditel_admin + unit_user)
- Auditoria ativa
- Contrato OpenAPI válido
- Todos os testes passando localmente (217 backend + 240 frontend + 21 E2E)

---

**Próximos passos recomendados (pós-deploy):**
1. Configurar domínio customizado no Render (se houver)
2. Migrar attachments para storage externo
3. Restringir whitelist Atlas
4. Configurar alertas de monitoramento no Render/Atlas
5. Documentar runbooks de operação (backup, restore, scaling)