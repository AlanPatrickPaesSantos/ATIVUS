# Runbook — backfill da situação de usuários

**Revisão:** 1 · **Data:** 2026-09-01 · **Escopo:** `migrate:user-situation`

Este procedimento normaliza o campo `situation` dos usuários legados. A migration é fail-closed: estados ambíguos ou inválidos não recebem acesso (`inactive`). Ela não altera senha, `passwordHash`, sessões, tokens ou outros campos.

## Pré-condições

- Change aprovada, janela de manutenção definida e responsável identificado.
- Código e dependências instalados na versão que será executada.
- Acesso ao MongoDB de destino com permissão mínima necessária.
- Aplicação parada ou em modo que impeça escritas concorrentes na coleção de usuários.
- Backup recente, completo e restaurável confirmado antes da execução.
- O valor de `MONGODB_URI` foi conferido contra o ambiente correto sem imprimir, copiar para logs ou compartilhar a URI completa. Nunca registre credenciais, query strings ou tokens.

Confirme a presença da variável sem revelar seu conteúdo:

```powershell
if ([string]::IsNullOrWhiteSpace($env:MONGODB_URI)) {
  throw 'MONGODB_URI não está definida.'
}
Write-Output 'MONGODB_URI definida; conteúdo omitido por segurança.'
```

## Backup

Use a ferramenta de backup aprovada pela operação. Exemplo com `mongodump`; substitua apenas o diretório local por um caminho controlado e não exiba a URI:

```powershell
$backupDir = 'C:\sigat-backups\user-situation-2026-09-01'
mongodump --uri="$env:MONGODB_URI" --out="$backupDir"
```

Confirme que o diretório contém o dump da base/coleção esperada, que o tamanho é plausível e que a restauração foi testada conforme o procedimento de disaster recovery. Não considere a migration autorizada sem essa confirmação.

## Execução

Na pasta `backend/`, gere primeiro um relatório local sem alterar a base:

```powershell
npm run migrate:user-situation -- --dry-run --report .\output\user-situation-dry-run.md
```

Revise o relatório antes de qualquer escrita. Ele informa `matched`, `wouldModify`, política de limpeza do legado, se a execução foi apenas simulação e um ledger mínimo por documento com `id`, situação anterior, situação normalizada e política aplicada ao campo legado `active`.

Depois execute a escrita real:

```powershell
npm run migrate:user-situation
```

A saída informa `matched` e `modified`:

- `matchedCount`: quantidade de documentos examinados pelo pipeline. Como a migration avalia todos os usuários, pode incluir documentos que já estavam corretos.
- `modifiedCount`: quantidade de documentos cujo `situation` efetivamente mudou. É o principal indicador da normalização aplicada.
- `modifiedCount` igual a zero pode ser esperado quando a base já está normalizada.

Política aplicada:

- `blocked` e `inactive` válidos são preservados.
- `active` é preservado somente quando não há conflito com a flag legada `active`.
- `situation` ausente ou `null` vira `active` somente com `active === true`.
- Situação inválida, flag ausente/não booleana em estado legado e conflitos são convertidos para `inactive`.
- A flag legada `active` é preservada por padrão para facilitar rollback e conferência.
- A limpeza dessa flag exige execução explícita com `--cleanup-legacy-active` após validar a base já normalizada.

Se a janela aprovar a limpeza do legado, execute separadamente:

```powershell
npm run migrate:user-situation -- --cleanup-legacy-active --report .\output\user-situation-cleanup.md
```

## Idempotência

Execute o mesmo comando uma segunda vez, ainda na janela controlada:

```powershell
npm run migrate:user-situation
```

Na segunda execução, `modifiedCount` deve ser `0`. Um valor diferente exige interromper o rollout, preservar os logs sem segredos e investigar a base antes de liberar novas escritas.

## Validação pós-migration

1. Confirme no MongoDB, usando consulta administrativa protegida, que não há usuários com `situation` ausente, `null` ou fora de `active`, `blocked`, `inactive`.
2. Valide login com um usuário DITEL ativo usando um mecanismo seguro de fornecimento de credenciais; não coloque senha real em documentação, logs ou comandos persistidos.
3. Com a sessão obtida, consulte `GET /api/v1/admin/users` e confirme resposta HTTP 200, paginação coerente e situações públicas esperadas (`active`, `blocked`, `inactive`).
4. Verifique que a resposta não contém `passwordHash`, senha, token, `tokenDigest` ou `sessionId`.
5. Valide pelo menos um usuário de unidade ativo e confirme que usuário bloqueado/inativo continua sem autenticar.

Exemplo de verificação de contrato sem registrar o corpo sensível da resposta:

```powershell
# Use uma sessão HTTP protegida e credenciais fornecidas fora do histórico do shell.
$adminUsersResponse = Invoke-WebRequest `
  -Uri 'http://localhost:3000/api/v1/admin/users?page=1&pageSize=20' `
  -Method Get `
  -WebSession $authenticatedSession

if ($adminUsersResponse.StatusCode -ne 200) {
  throw "GET /api/v1/admin/users retornou HTTP $($adminUsersResponse.StatusCode)."
}

$bodyText = $adminUsersResponse.Content
if ($bodyText -match 'passwordHash|tokenDigest|sessionId|"password"') {
  throw 'Resposta administrativa contém campo sensível.'
}
```

## Rollback

A migration não deve ser revertida com um `updateMany` genérico: isso pode destruir a distinção entre situação original e situação normalizada. O rollback oficial é restaurar o backup.

1. Interrompa a aplicação e bloqueie escritas na base de destino.
2. Confirme novamente a URI e o nome da base de destino sem expor a URI completa.
3. Preserve os logs e o estado atual para investigação.
4. Restaure o dump aprovado usando o procedimento operacional de MongoDB. Exemplo, somente após confirmar o alvo e obter autorização para substituir a coleção:

```powershell
mongorestore --uri="$env:MONGODB_URI" --nsInclude='<database>.users' --drop 'C:\sigat-backups\user-situation-2026-09-01\<database>\users.bson'
```

5. Execute as validações de login e `GET /api/v1/admin/users` novamente.
6. Libere escritas apenas após confirmar a saúde da aplicação e registrar a decisão de rollback.

O parâmetro `--drop` é destrutivo para a coleção indicada; nunca o execute sem validar explicitamente a base, a coleção e o backup.
