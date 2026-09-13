# Runbook — homologação local com MongoDB real

**Revisão:** 2 · **Data:** 2026-09-05 · **Escopo:** `ops:homolog:verify`, `ops:homolog:bootstrap`, `migrate:user-situation`, health/readiness, backup e rollback

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
