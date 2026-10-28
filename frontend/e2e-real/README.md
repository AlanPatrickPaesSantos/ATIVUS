# E2E real-backend ATIVUS

Este diretório contém smoke tests Playwright contra a API real, separados do E2E padrão com MSW.

O comando padrão `npm run test:e2e` continua usando MSW. Para validar homologação real, prepare o MongoDB conforme `../../backend/docs/runbook-homologacao-mongodb.md`, suba a API em `http://127.0.0.1:3010` com a origem do frontend real permitida:

O cenário de duas unidades fixa os IDs `pmpa:unit:bpm-06` (6º BPM) e `pmpa:unit:bpm-21` (21º BPM); somente as matrículas e senhas são fornecidas pelo operador.

```fish
set -lx MONGODB_URI 'mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0'
set -lx PORT 3010
set -lx SESSION_COOKIE_SECURE false
set -lx SESSION_COOKIE_SAME_SITE lax
set -lx ALLOWED_ORIGINS 'http://127.0.0.1:4174'
npm run dev
```

Em outro terminal, rode:

```fish
set -lx E2E_REAL_BACKEND_URL 'http://127.0.0.1:3010'
set -lx E2E_REAL_FRONTEND_PORT 4174
set -lx E2E_REAL_REQUIRE_ENV true

read --silent --prompt-str 'Matrícula DITEL: ' E2E_REAL_DITEL_REGISTRATION
read --silent --prompt-str 'Senha DITEL: ' E2E_REAL_DITEL_PASSWORD
set -lx E2E_REAL_DITEL_REGISTRATION $E2E_REAL_DITEL_REGISTRATION
set -lx E2E_REAL_DITEL_PASSWORD $E2E_REAL_DITEL_PASSWORD

read --silent --prompt-str 'Matrícula unidade A: ' E2E_REAL_UNIT_A_REGISTRATION
read --silent --prompt-str 'Senha unidade A: ' E2E_REAL_UNIT_A_PASSWORD
set -lx E2E_REAL_UNIT_A_REGISTRATION $E2E_REAL_UNIT_A_REGISTRATION
set -lx E2E_REAL_UNIT_A_PASSWORD $E2E_REAL_UNIT_A_PASSWORD

read --silent --prompt-str 'Matrícula unidade B: ' E2E_REAL_UNIT_B_REGISTRATION
read --silent --prompt-str 'Senha unidade B: ' E2E_REAL_UNIT_B_PASSWORD
set -lx E2E_REAL_UNIT_B_REGISTRATION $E2E_REAL_UNIT_B_REGISTRATION
set -lx E2E_REAL_UNIT_B_PASSWORD $E2E_REAL_UNIT_B_PASSWORD

npm run test:e2e:real
set -e E2E_REAL_DITEL_REGISTRATION E2E_REAL_DITEL_PASSWORD
set -e E2E_REAL_UNIT_A_REGISTRATION E2E_REAL_UNIT_A_PASSWORD
set -e E2E_REAL_UNIT_B_REGISTRATION E2E_REAL_UNIT_B_PASSWORD
```

As variáveis de senha são mantidas somente na memória do shell. Não despeje o arquivo age em terminal, não copie senhas para arquivos, não as envie ao chat e não use `--debug`.

Para carregar as duas credenciais do artefato age sem exibir seu conteúdo, use uma identidade privada local e mantenha a saída somente em variáveis do processo:

```fish
set -l AGE_IDENTITY '/caminho/privado/age-identity.txt'
set -l AGE_FILE '/caminho/privado/ativus-hml-users-tentativa5.age'
set -l UNIT_A_REGISTRATION 'MATRICULA_6_BPM'
set -l UNIT_B_REGISTRATION 'MATRICULA_21_BPM'

function load_unit_credential
    set -l fields (age --decrypt -i "$AGE_IDENTITY" "$AGE_FILE" | jq -r --arg registration "$argv[1]" '.credentials[] | select(.registration == $registration) | [.registration, .password] | @tsv' | string split \t)
    if test (count $fields) -ne 2
        return 1
    end
    set -gx $argv[2] $fields[1]
    set -gx $argv[3] $fields[2]
end

load_unit_credential "$UNIT_A_REGISTRATION" E2E_REAL_UNIT_A_REGISTRATION E2E_REAL_UNIT_A_PASSWORD
load_unit_credential "$UNIT_B_REGISTRATION" E2E_REAL_UNIT_B_REGISTRATION E2E_REAL_UNIT_B_PASSWORD
```

O comando não imprime o JSON descriptografado e não cria arquivo intermediário. Após o teste, remova as variáveis com `set -e`; nunca execute `set`, `env`, `history` ou `--debug` sobre os valores.

Por padrão, se alguma credencial obrigatória estiver ausente, o smoke real é ignorado com segurança. `E2E_REAL_REQUIRE_ENV=true` faz o comando falhar claramente quando faltar qualquer variável.

Os testes não criam fixtures, seeds, usuários, equipamentos, unidades, chamados ou movimentações. Login cria uma sessão e logout a revoga; essas são as únicas gravações autorizadas neste fluxo. Os testes validam health/readiness, duas unidades, isolamento por `unitId` e ID de equipamento, paginação, bloqueio 403 e ausência de dados sensíveis nas respostas. Traces e vídeos estão desativados no projeto real.
