# SIGAT backend

API Node.js/TypeScript do SIGAT. A API é versionada em `/api/v1` e mantém a autoridade sobre autenticação, autorização, escopo e persistência. O contrato vigente está em [`../docs/api/openapi.yaml`](../docs/api/openapi.yaml).

## Pré-requisitos

- Node.js LTS e npm;
- MongoDB acessível pela URI configurada em `MONGODB_URI`.

Copie `.env.example` para `.env` e ajuste os valores. O backend não carrega arquivos `.env` automaticamente; exporte as variáveis no shell ou use um carregador de ambiente no processo de execução.

## Variáveis de ambiente

| Variável | Obrigatória | Exemplo | Uso |
| --- | --- | --- | --- |
| `NODE_ENV` | não | `development` | Aceita `development`, `test` ou `production`; padrão `development`. |
| `PORT` | não | `3000` | Porta HTTP; padrão `3000`. |
| `MONGODB_URI` | para acesso ao MongoDB | `mongodb://127.0.0.1:27017/sigat` | URI usada por `connectToDatabase`; não há valor padrão seguro. |
| `SESSION_COOKIE_SECURE` | não | `false` | `true` exige HTTPS para o cookie; padrão `true` em produção e `false` nos demais ambientes. |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | não | `60000` | Janela do rate limit de login em milissegundos. |
| `LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP` | não | `10` | Máximo de falhas por IP dentro da janela do rate limit. |
| `LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_REGISTRATION` | não | `5` | Máximo de falhas por matrícula dentro da janela do rate limit. |
| `SESSION_ABSOLUTE_TTL_MS` | não | `43200000` | Vida absoluta da sessão em milissegundos. |
| `SESSION_IDLE_TTL_MS` | não | `1800000` | Tempo máximo de inatividade da sessão em milissegundos. |
| `ALLOWED_ORIGINS` | não | `https://sigat.exemplo.gov.br` | Lista separada por vírgula de origens aceitas para requisições mutáveis com cookie. |

## Comandos

Na pasta `backend/`:

```powershell
npm install
npm run dev
npm test
npm run test:integration
npm run typecheck
npm run build
npm run ops:homolog:verify
npm run ops:homolog:bootstrap
```

`npm test` usa MongoDB Memory Server nos testes e não substitui uma instância MongoDB para desenvolvimento. `npm run build` gera `dist/`; os testes ignoram esse diretório para evitar duplicação.

### Runbooks operacionais

- [Backfill da situação de usuários](docs/runbook-user-situation-migration.md)
- [Homologação local com MongoDB real](docs/runbook-homologacao-mongodb.md)

### Bootstrap e verificação de homologação

- `npm run ops:homolog:verify` faz checagem read-only de prontidão do MongoDB, suporte a transações e presença dos índices esperados pelo schema.
- `npm run ops:homolog:bootstrap` garante localmente as coleções/índices esperados e falha se o MongoDB não suportar transações.
- `npm run ops:homolog:bootstrap -- --seed-non-prod` adiciona um seed sintético mínimo apenas quando `HOMOLOGATION_SEED_PASSWORD` estiver definida e `NODE_ENV` não for `production`.

O seed sintético cria somente dados de homologação:

- usuário administrativo `hml-admin`
- usuário de unidade `hml-unit`
- unidade `hml-unit`

Nunca use esse seed em produção nem reutilize a mesma senha fora de homologação.

### Integração real

`npm run test:integration` executa a API Node real criada por `createApp` contra um `MongoMemoryReplSet` efêmero. A suíte usa Supertest, cria usuários, unidades, equipamento e chamados sintéticos por teste e encerra o replica set ao final. Ela cobre login/session, inventário, units, calls e movements/decision sem dados sensíveis. Os E2E Playwright com MSW continuam separados e focados na UI.

### Frontend com backend real local

Para desenvolvimento local integrado, rode o backend na porta configurada por `PORT` e o frontend com MSW desativado:

```powershell
# backend/
$env:PORT="3010"
npm run dev

# frontend/
$env:VITE_API_BASE_URL="/api/v1"
$env:VITE_BACKEND_URL="http://localhost:3010"
$env:VITE_ENABLE_MSW="false"
npm run dev
```

O Vite encaminha `/api/v1` para `VITE_BACKEND_URL` apenas durante `npm run dev`. Quando `VITE_BACKEND_URL` não é informado, o destino local padrão é `http://localhost:3010`. Builds de produção preservam `VITE_API_BASE_URL` e não recebem proxy de desenvolvimento.

### Health e readiness

- `GET /api/v1/health` valida apenas que o processo HTTP está vivo e aceitando requisições.
- `GET /api/v1/readiness` valida prontidão operacional do MongoDB com `ping`; retorna HTTP `503` quando a API está no ar mas o banco ainda não está pronto.

Limitações: essa suíte não inicia um processo HTTP separado nem testa Nginx, navegador ou um MongoDB externo; a integração de transporte é exercitada pelo Supertest e o banco é local/efêmero. Um ambiente de CI precisa permitir o download/execução do binário MongoDB usado pelo `mongodb-memory-server`.

## Segurança

- Senhas nunca são persistidas em texto puro: apenas hashes bcrypt são aceitos no modelo.
- `passwordHash` é omitido das consultas e serializações comuns; a autenticação o seleciona explicitamente apenas para verificação.
- A sessão usa token opaco em cookie `sigat_session` com `HttpOnly`, `SameSite=Lax`, `Path=/` e `Secure` conforme `SESSION_COOKIE_SECURE`.
- O token bruto não é armazenado no MongoDB; somente seu digest SHA-256 é persistido.
- O login aplica rate limit por IP e por matrícula com janela configurável, persistido em MongoDB para compartilhar bloqueios entre instâncias da API.
- Os contadores de rate limit usam `expiresAt` com índice TTL em MongoDB, mas a aplicação também ignora documentos expirados em leitura para não depender do atraso natural do limpador TTL.
- A sessão expira por tempo absoluto e por inatividade, com renovação da atividade a cada requisição autenticada válida.
- Requisições mutáveis com cookie validam `Origin`/`Referer` quando presentes; com `ALLOWED_ORIGINS` configurado, apenas as origens declaradas são aceitas.
- Mensagens de falha de login não revelam se a matrícula existe.
- Permissões e escopo são avaliados no backend; o frontend não acessa o banco diretamente.
- Eventos de auditoria registram ator, módulo, entidade, Unidade relacionada e snapshots `before`/`after` quando aplicável. Campos e valores sensíveis como senha, `passwordHash`, tokens, `tokenDigest` e `sessionId` são sanitizados antes da persistência e da leitura.
- A consulta `GET /api/v1/audit-events` é exclusiva para administradores DITEL e suporta filtros por período, usuário, módulo, ação, Unidade, entidade e resultado.
- Eventos novos recebem `retentionExpiresAt` com retenção explícita de seis anos. Não há índice TTL de exclusão automática nesta etapa; histórico legado sem metadado de retenção continua consultável.
- Falhas ao persistir auditoria em operações transacionais retornam `AUDIT_UNAVAILABLE` e impedem a confirmação parcial da mutação.

### Limitações operacionais do rate limit

- O compartilhamento do bloqueio depende de todas as réplicas apontarem para o mesmo MongoDB.
- Incrementos concorrentes no início da janela usam `upsert` atômico com retry em colisão de chave única para evitar perda de contagem entre instâncias.

## Migration de situação de usuário

- `npm run migrate:user-situation -- --dry-run --report <caminho>` gera relatório local sem alterar documentos.
- Sem `--cleanup-legacy-active`, a migration preserva a flag legada `active` para rollback e conferência operacional.
- `--cleanup-legacy-active` remove a flag legada apenas quando essa limpeza for explicitamente autorizada na janela operacional.

## Limitações desta etapa

- Não há implantação Debian, Nginx ou operação de produção incluída nesta etapa.
- Inventário, chamados, relatórios e integrações de domínio ainda não foram implementados.
