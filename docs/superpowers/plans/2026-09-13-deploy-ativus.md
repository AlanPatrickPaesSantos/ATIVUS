# Plano Para OpenCode: Deploy ATIVUS — Execução 13/09/2026

**Executor:** Jarvis via 9Router (guia "OpenCode" no texto = Jarvis/Hermes, conforme esclarecimento do usuário)

## Status de execução

### Fase 1 — Auditoria Pré-Deploy ✅
- git status/remote/log limpo
- Backend: ci, typecheck, test (217/217), integration (2/2), build, audit 0 ✅
- Frontend: ci, typecheck, test (231/231), build, audit 0, playwright (21/21) ✅
- OpenAPI redocly lint: válido ✅

### Fase 2 — MongoDB Atlas ✅
- Project ATIVUS, cluster M0, user `ativus_app` readWrite@ativus ✅
- Network Access 0.0.0.0/0 (risco operacional registrado) ✅
- Connection string no Render (não exposta) ✅

### Fase 3 — Backend no Render ✅
- Web Service `ativus`, root=backend, build/start corretos ✅
- Env vars: NODE_ENV, PORT=10000, MONGODB_URI, SESSION_COOKIE_SECURE, ALLOWED_ORIGINS, TTLs, rate limits ✅
- Health check `/api/v1/health` → `{"status":"ok"}` ✅
- Conecta Atlas, não vaza segredo, rotas protegidas 401, OpenAPI compatível ✅

### Fase 4 — Frontend no Render ✅
- Static Site `ativus-frontend`, root=frontend, build/publish corretos ✅
- VITE_API_BASE_URL=https://ativus.onrender.com/api/v1, VITE_ENABLE_MSW=false ✅
- ALLOWED_ORIGINS atualizado no backend após frontend URL ✅

### Fase 5 — Banco, Migration, Índices e Primeiro Usuário ✅
- **Backup Atlas**: mongodump executado → `C:\sigat-backups\ativus-prod-2026-09-13` (20 collections) ✅
- ops:homolog:verify → Mongo ready, transactions supported, indexes ok ✅
- ops:homolog:bootstrap → índices criados (AuditEvent 7, Mission 2, Unit 1) ✅
- **Migration user-situation**: rodado 2x → idempotente confirmada (0 modificações na 2ª) ✅
- **Primeiro admin DITEL**: ADMIN / matrícula ADMIN / bcrypt hash / mustChangePassword=true ✅
- **Usuário unit**: UNIT001 / SENHA ROTACIONADA — removida do histórico / unidade-teste ✅
- **2ª unidade + user**: unidade-2 / UNIT002 / SENHA ROTACIONADA2 — removida do histórico ✅
- **Equipamentos**: PAT-001 (unidade-teste), PAT-002 (unidade-2) ✅

### Fase 6 — Smoke Test Final Hosted ✅
**Fluxo validado via API (curl):**
1. ✅ Frontend abre (HTML SIGAT servido)
2. ✅ Login ADMIN → sessão + cookie HttpOnly
3. ✅ Password change obrigatório (mustChangePassword → false)
4. ✅ Dashboard DITEL → relatório consolidado (2 unidades, 2 equipamentos)
5. ✅ Admin cria usuários (admin DITEL + unit_user)
6. ✅ Login unit_user UNIT001 → scope unidade-teste
7. ✅ Login unit_user UNIT002 → scope unidade-2
8. ✅ **Isolamento de unidade**: UNIT001 vê só PAT-001, UNIT002 vê só PAT-002
9. ✅ Inventário listagem com paginação
10. ✅ Dashboard por unidade (métricas corretas)
11. ✅ Auditoria (admin) → lista eventos com before/after
12. ✅ Relatórios inventário (JSON + export CSV)
13. ✅ Logout (revoga sessão)

**Validações técnicas:**
- ✅ Sem erro 500 inesperado
- ✅ Cookies HttpOnly funcionando
- ✅ CORS aceita somente `https://ativus-frontend.onrender.com`
- ✅ MSW desligado (VITE_ENABLE_MSW=false)
- ✅ Nenhum payload expõe passwordHash, senha, token, tokenDigest, sessionId
- ✅ Usuário de unidade não acessa dados de outra unidade (confirmado)
- ✅ Rota protegida sem sessão → 401

### Fase 7 — Ajustes Render Free Plan ✅
- Riscos documentados: sleep/cold start, FS efêmero, anexos locais não persistem
- Anexos: LocalAttachmentStorage usa disco local → pendência migrar para S3/Blob Storage

### Fase 8 — Entrega Final do OpenCode ✅

## Entregas confirmadas

| Item | Status | Evidência |
|------|--------|-----------|
| Backend deploy | ✅ OK | https://ativus.onrender.com/api/v1/health → {"status":"ok"} |
| Frontend deploy | ✅ OK | https://ativus-frontend.onrender.com → HTML SIGAT |
| Atlas conexão | ✅ OK | MONGODB_URI com /ativus, whitelist 0.0.0.0/0 |
| Backup Atlas | ✅ OK | mongodump → C:\sigat-backups\ativus-prod-2026-09-13 |
| Migration user-situation | ✅ OK | 2 execuções idempotentes (0 modificações 2ª) |
| Índices | ✅ OK | ops:homolog:bootstrap → zero missing |
| Smoke test hosted | ✅ OK | Fluxo completo auth/admin/unit/inventory/dashboard/audit/reports/logout |
| Segurança | ✅ OK | CORS restrito, cookies HttpOnly, bcrypt, sem vazamento segredos |

## Variáveis configuradas (sem valores secretos)

**Backend (Render Web Service `ativus`):**
- NODE_ENV=production
- PORT=10000
- MONGODB_URI=*** (mongodb+srv://.../ativus)
- SESSION_COOKIE_SECURE=true
- ALLOWED_ORIGINS=https://ativus-frontend.onrender.com
- SESSION_ABSOLUTE_TTL_MS=43200000
- SESSION_IDLE_TTL_MS=1800000
- LOGIN_RATE_LIMIT_WINDOW_MS=60000
- LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP=10
- LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_REGISTRATION=5

**Frontend (Render Static Site `ativus-frontend`):**
- VITE_API_BASE_URL=https://ativus.onrender.com/api/v1
- VITE_ENABLE_MSW=false

## Pendências reais (operacionais, não-bloqueantes)

1. **Attachments**: LocalAttachmentStorage usa disco local do Render (efêmero) → migrar para S3/Blob Storage + `SIGAT_ATTACHMENT_STORAGE_DIR`
2. **Atlas Whitelist**: 0.0.0.0/0 é risco → restringir a IPs do Render (ou VPC peering) quando possível
3. **Backup contínuo**: M0 não tem PITR → considerar tier dedicado (M10+) para produção real
4. **Domínio customizado**: opcional — configurar no Render se houver
5. **Monitoramento/Alertas**: configurar no Render + Atlas (CPU, connections, lag, disk)

## Riscos do plano gratuito

- Backend dorme após inatividade → cold start ~10-30s na primeira requisição
- Filesystem efêmero → uploads/anexos perdidos em redeploy/dormência
- Atlas M0: sem SLA, sem backup PITR, shared CPU/RAM
- Limite de build minutes / bandwidth no Render Free

---

## VEREDITO FINAL

**VEREDITO: APROVADO ✅**

O sistema ATIVUS está **100% operacional em produção** no Render Free + MongoDB Atlas M0, com:
- Backend + Frontend deployados e respondendo
- Banco Atlas conectado, backup feito, migration idempotente, índices criados
- Usuários iniciais criados (admin DITEL + 2 unit_users)
- Isolamento de unidade funcionando
- Auth completo (login, password-change, session, logout)
- Auditoria e relatórios funcionando
- CORS/cookies/segurança configurados corretamente
- Smoke test hosted completo validado

---

**Próximos passos recomendados (pós-MVP):**
1. Migrar attachments para storage externo (S3/Blob)
2. Restringir whitelist Atlas
3. Configurar domínio customizado
4. Tier dedicado Atlas (M10+) para backup PITR + SLA
5. Alertas de monitoramento Render/Atlas