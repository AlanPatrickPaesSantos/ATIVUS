# E2E real-backend SIGAT

Este diretório contém smoke tests Playwright contra a API real, separados do E2E padrão com MSW.

O comando padrão `npm run test:e2e` continua usando MSW. Para validar homologação real, prepare o MongoDB conforme `../../backend/docs/runbook-homologacao-mongodb.md`, suba a API em `http://127.0.0.1:3010` com a origem do frontend real permitida:

```powershell
$env:PORT="3010"
$env:SESSION_COOKIE_SECURE="false"
$env:ALLOWED_ORIGINS="http://127.0.0.1:4174"
npm run dev
```

Em outro terminal, rode:

```powershell
$env:E2E_REAL_BACKEND_URL="http://127.0.0.1:3010"
$env:E2E_REAL_DITEL_REGISTRATION="hml-admin"
$env:E2E_REAL_DITEL_PASSWORD = Read-Host 'Senha DITEL homologação' -AsSecureString | ConvertFrom-SecureString -AsPlainText
$env:E2E_REAL_UNIT_REGISTRATION="hml-unit"
$env:E2E_REAL_UNIT_PASSWORD = Read-Host 'Senha unidade homologação' -AsSecureString | ConvertFrom-SecureString -AsPlainText
npm run test:e2e:real
Remove-Item Env:E2E_REAL_DITEL_PASSWORD
Remove-Item Env:E2E_REAL_UNIT_PASSWORD
```

Por padrão, se alguma credencial obrigatória estiver ausente, o smoke real é ignorado com segurança e o comando encerra com sucesso. Em CI ou em homologação obrigatória, habilite o modo estrito para falhar claramente quando faltar qualquer variável:

```powershell
$env:E2E_REAL_REQUIRE_ENV="true"
npm run test:e2e:real
```

Os testes evitam mutações e validam health/readiness, login real com cookie, acesso DITEL, bloqueio 403 para usuário de unidade em rota administrativa e ausência de `passwordHash`, `tokenDigest` e `sessionId` nos corpos de resposta.
