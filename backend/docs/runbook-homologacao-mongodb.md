# Runbook — homologação local com MongoDB real

**Revisão:** 5 · **Data:** 2026-09-15 · **Escopo:** `ops:homolog:verify`, `ops:homolog:bootstrap`, `migrate:user-situation`, health/readiness, backup, rollback, **monitoramento de produção** e **pacote offsite criptografado** (local e Atlas ATIVUS)

Este procedimento prepara e verifica a homologação local do SIGAT contra um MongoDB real já existente, sem provisionar serviços externos e sem exigir alteração de dados reais para a checagem básica. O objetivo é validar conectividade, suporte a transações, índices, readiness e o fluxo seguro de migration.

## Pré-condições

- Código do `backend/` instalado com `npm install`.
- `MONGODB_URI` apontando para a base de homologação correta.
- `NODE_ENV` diferente de `production` para qualquer uso de seed sintético.
- API local reservada na porta `3010` para evitar conflito com outros serviços de desenvolvimento.
- Janela operacional definida para qualquer escrita deliberada, inclusive criação de índices e migrations.
- Backup e rollback aprovados antes de qualquer comando que altere documentos.

Nunca imprima, copie ou registre o valor completo de `MONGODB_URI`; ele pode conter credenciais, host interno e opções sensíveis.

Confirme apenas a presença das variáveis, sem imprimir segredos:

```powershell
if ([string]::IsNullOrWhiteSpace($env:MONGODB_URI)) {
  throw 'MONGODB_URI não está definida.'
}

Write-Output 'MONGODB_URI definida; conteúdo omitido por segurança.'
Write-Output "NODE_ENV=$($env:NODE_ENV ?? 'development')"
```

Configure a API local com cookies compatíveis com HTTP local e origem conhecida:

```powershell
$env:PORT="3010"
$env:SESSION_COOKIE_SECURE="false"
$env:ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5174"
```

## 1. Verificação read-only

Na pasta `backend/`, execute primeiro a inspeção sem alterar documentos:

```powershell
npm run ops:homolog:verify
```

A saída informa:

- base conectada;
- se o Mongo responde ao `ping`;
- se o deployment suporta transações;
- se os índices esperados pelos schemas estão presentes;
- se houve seed sintético nesta execução.

Se `Mongo ready: no`, `Transaction support: unsupported` ou `Indexes ready: no`, não avance para smoke real da aplicação.

## 2. Bootstrap seguro de índices

Quando a verificação apontar índices ausentes e a janela permitir escrita operacional, execute:

```powershell
npm run ops:homolog:bootstrap
```

Esse comando:

- conecta no Mongo informado por `MONGODB_URI`;
- falha se o deployment não suportar transações exigidas pelo SIGAT;
- cria coleções quando necessário;
- garante os índices declarados nos schemas atuais;
- não apaga documentos;
- não remove índices extras manualmente existentes.

Depois, rode novamente:

```powershell
npm run ops:homolog:verify
```

O esperado é `Indexes ready: yes`.

## 3. Seed sintético mínimo opcional

Use apenas se a homologação ainda não tiver credenciais sintéticas controladas. Nunca use em produção nem em uma base que contenha dados reais de usuários.

Defina uma senha transitória fora do histórico persistente do shell e execute:

```powershell
$env:HOMOLOGATION_SEED_PASSWORD = Read-Host 'Senha do seed sintético' -AsSecureString | `
  ConvertFrom-SecureString -AsPlainText
npm run ops:homolog:bootstrap -- --seed-non-prod
Remove-Item Env:HOMOLOGATION_SEED_PASSWORD
```

O seed cria somente:

- unidade `hml-unit`;
- usuária de unidade `hml-unit`;
- administradora `hml-admin`.

Esses registros são explicitamente não produtivos e só são criados quando ausentes.

Guardas esperados:

- sem `--seed-non-prod`, o bootstrap não cria usuários nem unidades sintéticas;
- com `--seed-non-prod`, `HOMOLOGATION_SEED_PASSWORD` é obrigatório;
- com `NODE_ENV=production`, o seed é rejeitado mesmo com senha definida.

## 4. Health e readiness da aplicação

Com o Mongo verificado, inicie a API local:

```powershell
npm run dev
```

Em outro terminal:

```powershell
Invoke-WebRequest -Uri 'http://localhost:3010/api/v1/health' -Method Get
Invoke-WebRequest -Uri 'http://localhost:3010/api/v1/readiness' -Method Get
```

Critério esperado:

- `GET /health` retorna HTTP 200 quando o processo está vivo;
- `GET /readiness` retorna HTTP 200 apenas quando o Mongo está pronto e responde a `ping`.

## 5. Migration com dry-run e ledger

Antes de qualquer escrita de migration, gere o relatório local:

```powershell
npm run migrate:user-situation -- --dry-run --report .\output\user-situation-dry-run.md
```

Revise o ledger do relatório e só então avance para a aplicação real conforme o runbook específico:

- [Backfill da situação de usuários](runbook-user-situation-migration.md)

## 6. Backup e aplicação

Antes de rodar qualquer escrita em base real de homologação:

1. confirme `MONGODB_URI` sem expor a string;
2. gere backup aprovado pela operação;
3. confira que o dump contém a base/coleções esperadas;
4. registre local do backup, horário, versão do código e responsável;
5. execute `npm run ops:homolog:verify` e preserve a saída sem segredos;
6. só então execute a migration planejada.

Exemplo de backup:

```powershell
$backupDir = 'C:\sigat-backups\homolog-2026-09-04'
mongodump --uri="$env:MONGODB_URI" --out="$backupDir"
```

Para aplicar a migration de situação após aprovação operacional:

```powershell
npm run migrate:user-situation -- --report .\output\user-situation-apply.md
npm run migrate:user-situation
```

A segunda execução deve retornar `modifiedCount` igual a `0`; se não retornar, interrompa a janela e investigue antes de liberar novas escritas.

## 7. Rollback

- Não reverta migrations com `updateMany` genérico.
- O rollback oficial é restauração do backup validado.
- Preserve logs operacionais sem segredos e registre o motivo do rollback.
- Pare a aplicação ou bloqueie escritas antes de restaurar.
- Refaça `ops:homolog:verify`, `GET /health` e `GET /readiness` após a restauração.

Exemplo, apenas após validar explicitamente alvo e backup:

```powershell
mongorestore --uri="$env:MONGODB_URI" --drop 'C:\sigat-backups\homolog-2026-09-04'
```

`--drop` é destrutivo; nunca execute sem confirmar base e janela.

## 8. Backup e restauração testada do MongoDB Atlas (ATIVUS — produção)

Validado em 14/09/2026 (backup real + restore em banco local isolado). **Nunca** imprima `MONGODB_URI`, usuário, senha ou connection string completa. A URI fica apenas em arquivo fora do repositório (ex.: `C:\Jarvis Backups\.mongo_uri.txt`) e em variável segura do ambiente.

### 8.1 Ferramentas (Windows)

- `mongodump` / `mongorestore`: `C:\Program Files\MongoDB\Tools\100\bin\`
- `mongosh`: `C:\Users\<user>\AppData\Local\Programs\mongosh\mongosh`

⚠️ **Pitfall de caminho:** `mongodump`/`mongorestore` são executáveis Windows nativos — **não** aceitam caminho estilo MSYS (`/c/...`). Use sempre `C:\sigat-backups\...` (ou `cygpath -w`). Passar `/c/...` faz o dump cair em `C:\c\sigat-backups\...`.

### 8.2 Backup (produção Atlas)

```powershell
$backupDir = "C:\sigat-backups\ativus-atlas-$(Get-Date -Format 'yyyy-MM-dd-HHmm')"
# URI lida de arquivo fora do repo — nunca no comando/terminal
$uri = Get-Content 'C:\Jarvis Backups\.mongo_uri.txt' -Raw
& 'C:\Program Files\MongoDB\Tools\100\bin\mongodump.exe' --uri="$uri" --out="$backupDir"
```

Validar: o dump gera `prelude.json` + pastas por banco (`ativus\*.bson` + `*.metadata.json`). O usuário do Atlas pode exportar também a base `test` (contaminada) — o restore deve mirar só `ativus`.

### 8.3 Restauração em ambiente isolado (teste)

```powershell
$dump = "C:\sigat-backups\ativus-atlas-2026-09-14-2122"   # raiz do dump
$dbName = "ativus_restore_test_$(Get-Date -Format 'yyyyMMdd')"
& 'C:\Program Files\MongoDB\Tools\100\bin\mongorestore.exe' `
  --uri="mongodb://127.0.0.1:27017" `
  --dir="$dump" `
  --nsFrom="ativus.*" --nsTo="$dbName.*"
```

Nunca restaurar sobre `sigat` local nem sobre produção. O nome `test` do dump não é tocado pelo `nsFrom` específico.

### 8.4 Validação pós-restore

```powershell
mongosh "mongodb://127.0.0.1:27017/$dbName" --eval "db.getCollectionNames().sort().forEach(n=>print(n+': '+db.getCollection(n).countDocuments({})))"
mongosh "mongodb://127.0.0.1:27017/$dbName" --eval "db.getCollectionNames().forEach(n=>print(n+': '+db.getCollection(n).getIndexes().map(i=>i.name).join(',')))"
```

Esperado (14/09, dump de produção): `users: 5`, `units: 2`, `equipment: 2`, `auditevents: 68`, `sessions: 25`; índices únicos de `registration`, `patrimony`, `protocol`, `idempotencyKey` presentes.

### 8.5 Rollback de produção (conceitual — NÃO executar sem janela/autorização)

Restaurar produção exige: parar a aplicação ou bloquear escritas, janela de manutenção aprovada, e `--drop` confirmado. Comando de referência (não executar):

```powershell
# NUNCA roda sem autorização explícita e janela; exigiria URI de produção + --drop
# & 'C:\Program Files\MongoDB\Tools\100\bin\mongorestore.exe' --uri="$env:MONGODB_URI" --drop "$dump"
```

### 8.6 Pendências

- Periodicidade do backup (definir cron/agendamento).
- Local seguro/offsite para backups (hoje `C:\sigat-backups`, disco local).
- Criptografia em repouso e controle de acesso ao diretório.
- Upgrade Atlas M10+ para PITR (point-in-time recovery) quando possível.

### 8.7 Backup periódico agendado (Windows)

Implementado em 14/09/2026. Script + tarefa agendada fora do repositório.

**Script:** `C:\sigat-backups\scripts\backup-ativus-atlas.ps1`
- Lê a URI de `C:\Jarvis Backups\.mongo_uri.txt` (nunca imprime).
- Executa `mongodump` para `C:\sigat-backups\ativus-atlas-<AAAA-MM-DD-HHmm>`.
- Valida pasta `ativus` + `.bson`; registra contagem/tamanho.
- Aplica retenção local de **7 backups** (`ativus-atlas-*`), com guarda de containment (só apaga dentro de `C:\sigat-backups`).
- Log sanitizado: `C:\sigat-backups\logs\ativus-backup-<AAAA-MM>.log`.
- Exit code: 0 sucesso, 1 falha, 2 falha de retenção.

**Tarefa agendada:** `ATIVUS MongoDB Atlas Backup`
- Diária às **02:30**.
- Comando: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\sigat-backups\scripts\backup-ativus-atlas.ps1"`
- Criada com: `schtasks /Create /TN "ATIVUS MongoDB Atlas Backup" /TR "<comando>" /SC DAILY /ST 02:30 /F`
- Ver: `schtasks /Query /TN "ATIVUS MongoDB Atlas Backup" /FO LIST`
- Rodar manualmente: `powershell -Command "Start-ScheduledTask -TaskName 'ATIVUS MongoDB Atlas Backup'"`
- Desativar: `schtasks /Change /TN "ATIVUS MongoDB Atlas Backup" /DISABLE` (ou `/Delete` para remover).
- ⚠️ Modo de logon: "Interactive only" (usuário logado). Para rodar sem sessão interativa, registra com credenciais (exige senha do usuário) — decisão operacional.

**Como verificar logs:** `C:\sigat-backups\logs\ativus-backup-<AAAA-MM>.log` — deve conter `Backup concluído com sucesso` e nenhuma connection string.

**Teste mensal de restore:** seguir seção 8.3 (restore em banco isolado `ativus_restore_test_<data>`), validar contagens e índices (seção 8.4). Recomendado 1x/mês.

## 9. Monitoramento mínimo de produção (ATIVUS)

Implementado em 15/09/2026. Camada de health check local e gratuita: verifica backend, frontend e backup, sem expor segredos e sem integração paga. Não altera funcionalidades do sistema.

### 9.1 Serviços monitorados

- Backend: `https://ativus.onrender.com` · health em `https://ativus.onrender.com/api/v1/health` (espera HTTP 200 + `{"status":"ok"}`)
- Frontend: `https://ativus-frontend.onrender.com` (espera HTTP 200 + HTML do SIGAT)
- Atlas: cluster `clusterativus` M0 (indiretamente via backup)
- Backup local: tarefa `ATIVUS MongoDB Atlas Backup` (diária 02:30)

### 9.2 Script de health check

**Script:** `C:\sigat-backups\scripts\check-ativus-health.ps1` (fora do repositório)
- `GET` no health do backend; valida HTTP 200 **e** body `{"status":"ok"}`;
- `GET` no frontend; valida HTTP 200;
- lê a última execução da tarefa `ATIVUS MongoDB Atlas Backup` (`LastTaskResult` deve ser 0, e `LastRunTime` dentro das últimas 36h por padrão);
- verifica se existe diretório `ativus-atlas-*` com menos de 36h (padrão);
- verifica o log mensal `ativus-backup-<AAAA-MM>.log`: erro recente (últimas 24h por padrão) é fatal **somente se não houve sucesso posterior**; caso recuperado, vira `WARN`;
- escreve log sanitizado em `C:\sigat-backups\logs\ativus-health-<AAAA-MM>.log`;
- exit code: `0` tudo OK, `1` config/caminho, `2` backend/frontend, `3` backup (tarefa/dump/log).

Parâmetros opcionais (uso em teste): `-BackendUrlOverride`, `-FrontendUrlOverride`, `-BackupMaxAgeHours`, `-BackupErrorAgeHours`.

### 9.3 Tarefa agendada

**Tarefa:** `ATIVUS Health Check`
- Frequência: a cada **30 minutos**; criada com `schtasks /Create /TN "ATIVUS Health Check" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"C:\sigat-backups\scripts\check-ativus-health.ps1\"" /SC MINUTE /MO 30 /F`
- Modo de logon: **Interactive only** (roda somente com o usuário `alanp` logado; não exige senha do Windows).
- Ver: `schtasks /Query /TN "ATIVUS Health Check" /FO LIST /V`
- Rodar manualmente: `powershell -Command "Start-ScheduledTask -TaskName 'ATIVUS Health Check'"`
- Último resultado: `Get-ScheduledTask -TaskName 'ATIVUS Health Check' | Get-ScheduledTaskInfo`
- Desativar: `schtasks /Change /TN "ATIVUS Health Check" /DISABLE` (ou `/Delete` para remover).

> ⚠️ Limitação: "Interactive only" — se o PC estiver desligado/logoff, o health check não roda. Para rodar sem sessão interativa seria necessária senha do Windows ou conta de serviço (decisão operacional; não feito nesta fase).

### 9.4 Logs

- Health: `C:\sigat-backups\logs\ativus-health-<AAAA-MM>.log` — apenas timestamp, status backend, status frontend, último backup, resultado da tarefa e mensagens sanitizadas. Nunca cookies, payloads, URI do Atlas ou credenciais.
- Backup: `C:\sigat-backups\logs\ativus-backup-<AAAA-MM>.log` (seção 8.7).

### 9.5 Como interpretar falhas

| Sintoma | Significado | Ação |
|---|---|---|
| `BACKEND FALHA` | HTTP != 200 ou body sem `{"status":"ok"}` | Ver logs do Render (seção 9.6); checar se o serviço está up; cold start pode demorar ~50s no plano gratuito |
| `FRONTEND FALHA` | HTTP != 200 | Ver logs do Render do serviço frontend; checar se build/deploy falhou |
| `BACKUP FALHA` (tarefa antiga) | `LastRunTime` > 36h | Ver se a tarefa `ATIVUS MongoDB Atlas Backup` está habilitada e o PC ligado na janela; rodar manualmente |
| `BACKUP FALHA` (result != 0) | Última execução da tarefa retornou erro | Ver `ativus-backup-*.log` do dia |
| `BACKUP FALHA` (dump antigo) | Nenhum `ativus-atlas-*` nas últimas 36h | rodar backup manual; checar espaço em disco |
| `BACKUP FALHA` (erro recente sem sucesso) | Log de backup com `ERROR` recente não recuperado | Ver log de backup; se houve `Backup concluido com sucesso` depois do erro, o script registra `WARN` e segue |

Exit codes: `0` OK; `1` config (caminho/arquivos base); `2` backend/frontend; `3` backup.

### 9.6 Render — logs e sintomas comuns

Abrir logs do backend no Render:
1. Dashboard Render → serviço **ativus** (backend) → aba **Logs**;
2. Para logs ao vivo durante um incidente, marcar **Live** no topo;
3. Para eventos recentes, Rolling Logs (últimas horas) ou filtrar por nível de severidade;
4. Se o serviço reiniciou, o topo mostra o motivo (deploy, crash, cold start).

Sintomas comuns no plano gratuito:
- **Cold start** (plano gratuito): após ~15 min sem tráfego o serviço "dorme" e o primeiro request demora (pode passar de 50s); o health check usa timeout de 45s — **uma falha única de cold start pode gerar falso negativo**; o próximo ciclo de 30 min normalmente normaliza.
- **500 no backend**: ver `Logs`; procurar stack trace; pode ser falta de variável de ambiente, falha de conexão com Atlas ou bug de código.
- **401 esperado sem sessão**: endpoints protegidos retornam 401 quando não há cookie de sessão válido — comportamento esperado, não é incidente.
- **403 esperado com Origin inválida**: o backend valida `ALLOWED_ORIGINS`; chamadas com Origin desconhecida retornam 403 — comportamento esperado.
- **Falha de conexão Atlas**: erros `MongoNetworkError`, `ECONNREFUSED`, timeouts de `mongodb+srv` nos logs do Render; ver Dashboard Atlas (seção 9.7).

### 9.7 Atlas — onde olhar

1. Dashboard Atlas → cluster `clusterativus` (M0) → **Metrics**: CPU, connections, opcounters, network.
2. **Connections**: pico de conexões vs limite do M0 (500); conexões abertas demais podem vir de cold start/retry.
3. **Storage**: monitorar espaço usado vs limite do M0 (512 MB); backups locais via mongodump crescem conforme os dados.
4. **Network Access**: `0.0.0.0/0` permanece **temporariamente autorizado** — NÃO alterar nesta fase (decisão operacional; registrar quando houver janela para restringir).
5. **Database Access**: usuários/database users; não expor credenciais.

### 9.8 Alertas

Nesta fase: **log local + exit code** (sem integração externa). A tarefa também pode ser monitorada pelo Windows Event Log futuramente (o Task Scheduler já registra falhas como evento); e-mail/Telegram/Discord requerem autorização e credenciais próprias — pendente.

### 9.9 Limitações do plano gratuito Render

- Cold start (serviços dormem após inatividade; primeiro request lento).
- Recursos limitados (CPU/memória compartilhados).
- Sem SLA/uptime garantido; deploys e reinícios podem gerar janelas de indisponibilidade.
- O health check roda apenas enquanto o usuário está logado no Windows (interactive only).

### 9.10 Pendências do monitoramento

- Alerta externo real (Event Log → e-mail/Telegram/Discord) quando autorizado;
- Monitoramento Render/Atlas mais avançado (uptime externo, métricas de CPU/memória, alertas de custo);
- Domínio customizado;
- Cópia offsite/criptografada dos backups.

## 10. Pacote offsite criptografado dos backups (ATIVUS)

Implementado em 15/09/2026. Gera um archive criptografado (AES-256) do backup MongoDB Atlas mais recente, pronto para cópia externa/offsite — sem expor URI, senha, dumps sensíveis ou dados pessoais em logs/repo.

### 10.1 Ferramenta: OpenSSL (7-Zip não instalado)

- 7-Zip **não está instalado** no host. Decisão do usuário (15/09): usar **OpenSSL 3.5.7** (já disponível via Git for Windows) com AES-256-CBC + PBKDF2 (200k iterações) + salt — nível de segurança equivalente ao 7-Zip AES-256.
- Binário: `C:\Program Files\Git\mingw64\bin\openssl.exe`
- Alternativa futura: instalar 7-Zip (requer autorização) para `.7z` com AES-256.

### 10.2 Chave de criptografia

- Arquivo: `C:\Jarvis Backups\.backup_archive_key.txt` (fora do repo, ACL restrita a `ALAN\alanp` — Full Control, sem herança).
- Formato: 64 caracteres hex (256 bits). Gerada com `openssl rand -hex 32`.
- **Nunca** imprimir, copiar para log, repo ou email. Backup da chave (papel/cofre) é responsabilidade operacional.

### 10.3 Script

**Script:** `C:\sigat-backups\scripts\package-latest-ativus-backup.ps1`
- Localiza o backup local mais recente `C:\sigat-backups\ativus-atlas-*`;
- Valida presença de `ativus/*.bson`;
- Cria `C:\sigat-backups\offsite`;
- Gera **tar** temporário do diretório `ativus` (apenas o backup escolhido; nunca inclui logs, URI, scripts, chave);
- Criptografa com OpenSSL AES-256-CBC + PBKDF2 + salt (chave via variável de ambiente, **nunca** argumento de linha de comando);
- Remove o tar temporário (nenhum dado em claro permanece);
- Valida exit code do 7z-equivalente (openssl), testa integridade (`openssl dgst -sha256`), revalida decriptando e listando `ativus/*.bson`;
- Aplica **retenção de 7 archives** (somente dentro de `C:\sigat-backups\offsite`); não apaga backups locais originais;
- Log sanitizado em `C:\sigat-backups\logs\ativus-offsite-<AAAA-MM>.log`.

Exit codes: `0` OK, `1` config/caminho, `2` backup ausente, `3` empacotamento/cripto, `4` teste/validação, `5` retenção.

### 10.4 Saída

- `C:\sigat-backups\offsite\ativus-atlas-<AAA-MM-DD-HHmm>.enc` (encrypted archive, OpenSSL format).
- Restaurar a partir do `.enc` (documentar no destino offsite):
  ```powershell
  $env:ATIVUS_ARCHIVE_KEY = (Get-Content 'C:\Jarvis Backups\.backup_archive_key.txt' -Raw).Trim()
  & 'C:\Program Files\Git\mingw64\bin\openssl.exe' enc -d -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:ATIVUS_ARCHIVE_KEY -in '<archive>.enc' -out '<archive>.tar'
  tar --force-local -xf '<archive>.tar' -C '<destino>'
  Remove-Item Env:ATIVUS_ARCHIVE_KEY
  ```
  Depois: `mongorestore` a partir da pasta `ativus` extraída (ver seção 8.3/8.5).

### 10.5 Tarefa agendada

- **`ATIVUS Package Encrypted Backup`** — diária às **02:50** (após o backup 02:30).
- Comando: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\sigat-backups\scripts\package-latest-ativus-backup.ps1"`
- Criada com: `schtasks /Create /TN "ATIVUS Package Encrypted Backup" /TR "<comando>" /SC DAILY /ST 02:50 /F`
- Ver: `schtasks /Query /TN "ATIVUS Package Encrypted Backup" /FO LIST /V`
- Rodar manualmente: `powershell -Command "Start-ScheduledTask -TaskName 'ATIVUS Package Encrypted Backup'"`
- Desativar: `schtasks /Change /TN "ATIVUS Package Encrypted Backup" /DISABLE` (ou `/Delete`).
- Modo: **Interactive only** (usuário logado; sem senha Windows). Mesma limitação da tarefa de backup.

### 10.6 Segurança (verificada)

- Logs: somente metadados (nome do backup, tamanho do archive, sucesso/falha) — nunca chave, URI, senha ou conteúdo.
- Chave: ACL restrita a `alanp`, fora do repo.
- Repo: nenhum `.enc`, `.7z`, dump, chave ou senha em `git status` / `git grep` / `rg`.
- Copies offsite: **manual ainda** — nenhum upload automático sem autorização.

### 10.7 Pendências do offsite

- Escolher destino offsite real (manual, nuvem sincronizada — ex. OneDrive privado, HD externo, servidor próprio);
- Decidir cópia manual vs automática;
- Teste mensal de restore a partir do `.enc` criptografado (recomendado junto do teste mensal da seção 8.3);
- Considerar instalar 7-Zip para `.7z` se preferência futura.
