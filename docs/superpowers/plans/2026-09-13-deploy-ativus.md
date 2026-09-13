# Plano Para OpenCode: Deploy ATIVUS — Execução 13/09/2026

**Executor:** Jarvis via 9Router (guia "OpenCode" no texto = Jarvis/Hermes, conforme esclarecimento do usuário)

## Status de execução

### Fase 1 — Auditoria Pré-Deploy ✅
- git status limpo, remote origin = github.com/AlanPatrickPaesSantos/ATIVUS, log 3 commits (619888e, 11a43d3, 04b8d0f)
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

- **backend/tsconfig.json**: removido `"vitest/globals"` dos `types` e adicionado `"exclude": ["src/**/*.test.ts", "src/integration"]` → build sobe sem devDeps, typecheck local continua OK (vitest instalado localmente)
- **frontend/tsconfig.app.json**: removido `"vitest/globals"` dos `types` e adicionado `"exclude": ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.spec.ts", "src/**/*.spec.tsx", "src/e2e"]` → build sobe sem devDeps
- Ambas correções commitadas (619888e) e pushadas.

### Fase 2 — MongoDB Atlas ✅ (cluster criado por usuário)
- Cluster ATIVUS (M0 Free) criado
- Database User `ativus_app` com senha guardada (não exposta)
- Connection string guardada localmente (não logada)
- Network Access liberado (0.0.0.0/0 por enquanto — risco operacional registrado)

### Fase 3 — Render (aguarda deploy)
- Web Service `ativus-backend` criado por usuário
- Variáveis de ambiente: NODE_ENV, PORT=10000, MONGODB_URI, SESSION_COOKIE_SECURE=true, ALLOWED_ORIGINS=(vazio provisório), TTLs, rate limits
- **Erro TS2688 corrigido** → push `619888e` com tsconfig excludes
- **Erro TS2307 corrigido** → tsconfig.app excludes testes do build
- **Auto-deploy no Render**: aguardar (ou Deploy manual → Deploy latest commit)

### Fases 4–8 [pendente]