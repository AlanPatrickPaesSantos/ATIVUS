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
- Web Service `ativus-backend` criado por usuário
- Variáveis de ambiente configuradas (NODE_ENV, PORT=10000, MONGODB_URI, SESSION_COOKIE_SECURE=true, ALLOWED_ORIGINS=(vazio provisório), TTLs, rate limits)
- **Erro TS2688 corrigido** → push ba57253 com tsconfig excludes
- **Backend Live e respondendo:** health check curl OK (`https://ativus-backend.onrender.com/api/v1/health`)

### Fase 4 — Render Frontend [pendente — criação manual]
- Static Site `ativus-frontend` ainda não criado no Render
- Instruções passadas ao usuário para criar via dashboard:
  - New → Static Site → repo `AlanPatrickPaesSantos/ATIVUS`, branch `master`, root `frontend`
  - Build: `npm ci && npm run build`, Publish: `dist`
  - EnvVars: `VITE_API_BASE_URL=https://ativus-backend.onrender.com/api/v1`, `VITE_ENABLE_MSW=false`
- **Ação necessária do usuário:** criar o Static Site e me avisar quando estiver Live

### Fase 5 — Banco, Migration, Índices e Primeiro Usuário [pendente]
### Fase 6 — Smoke Test Final Hosted [pendente]
### Fase 7 — Ajustes Render Free Plan [pendente]
### Fase 8 — Entrega Final do OpenCode [pendente]

### Logs e próximos passos
1. Usuário deve criar Static Site `ativus-frontend` no Render (aguardo URL)
2. Após frontend Live: atualizar `ALLOWED_ORIGINS` no backend → redeploy
3. Rodar smoke test completo no ambiente hospedado
4. Backup Atlas, migration, índices, primeiro admin DITEL
5. Relatório final (VEREDITO: APROVADO ou REPROVADO)
