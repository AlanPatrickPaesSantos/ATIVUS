# Catálogo organizacional PMPA — ATIVUS

Versão: 2026-10-27
Comandos confirmados no catálogo: 20
Comandos pendentes: 1
Registros brutos considerados: 88
Unidades únicas normalizadas: 90
Unidades divergentes: 4
Unidades pendentes: 5

## Totais por comando

| Comando | Registros observados | Unidades únicas | Confirmadas | Divergentes | Pendentes |
|---|---:|---:|---:|---:|---:|
| CPC I | 5 | 6 | 6 | 0 | 0 |
| CPC II | 4 | 5 | 5 | 0 | 0 |
| CPRM | 5 | 6 | 6 | 0 | 0 |
| CPE | 5 | 5 | 5 | 0 | 0 |
| CME | 5 | 7 | 7 | 0 | 0 |
| CPA | 3 | 3 | 3 | 0 | 0 |
| CPR I | 4 | 4 | 4 | 0 | 0 |
| CPR II | 8 | 5 | 4 | 1 | 0 |
| CPR III | 6 | 5 | 5 | 0 | 0 |
| CPR IV | 4 | 4 | 4 | 0 | 0 |
| CPR V | 3 | 3 | 3 | 0 | 0 |
| CPR VI | 3 | 2 | 2 | 0 | 0 |
| CPR VII | 6 | 6 | 6 | 0 | 0 |
| CPR VIII | 6 | 5 | 5 | 0 | 0 |
| CPR IX | 5 | 5 | 5 | 0 | 0 |
| CPR X | 4 | 4 | 4 | 0 | 0 |
| CPR XI | 2 | 2 | 2 | 0 | 0 |
| CPR XII | 3 | 3 | 3 | 0 | 0 |
| CPR XIII | 4 | 3 | 1 | 2 | 0 |
| CPR XIV | 3 | 2 | 1 | 1 | 0 |

## Pendências e divergências

- **BME-01** — pending: A fonte complementar lista BME-01 em contexto regional; o Decreto prioritário trata CIME, não confirma este vínculo.
- **BME-03** — pending: Registro da página complementar sem ato estrutural localizado nesta fase.
- **BPM-17** — divergent: A página de Órgãos de Execução lista o 17º BPM no CPR VIII e CPR XIII; o vínculo exige confirmação documental específica.
- **BPM-23** — divergent: A página complementar apresenta o 23º BPM em CPR II e CPR XIV; mantido sem promoção a vínculo definitivo.
- **BPM-36** — divergent: Registro duplicado em dois comandos na fonte complementar.
- **CIPAMB-02** — pending: Unidade especializada listada, mas sem vínculo formal fechado no catálogo prioritário.
- **CIPAMB-03** — pending: Unidade especializada listada, mas sem vínculo formal fechado no catálogo prioritário.
- **CIPAMB-04** — pending: Unidade especializada listada, mas sem vínculo formal fechado no catálogo prioritário.
- **CIPM-25** — divergent: A 25ª CIPM aparece em CPR II e CPR XIV na fonte complementar; exige confirmação do ato vigente.
- **CPR XV** — comando pendente: Mencionado em publicação institucional recente, sem ato estrutural e composição confirmados nesta fase.

## Compatibilidade com registros legados

- Os campos atuais `id`, `name`, `acronym`, `active` e timestamps permanecem preservados.
- `parentUnitId`, `kind`, `verificationStatus` e fontes são metadados opcionais; registros antigos continuam válidos.
- Equipamentos e usuários continuam usando snapshots de unidade; a hierarquia não reescreve históricos.
- A proveniência demonstrativa fica em `Equipment.provenance` e não é necessária para equipamentos legados.
- `importBatchId` identifica exclusivamente uma futura importação e não autoriza exclusão ampla.
- O bootstrap de produção deve usar `autoIndex: false` e criar índices somente por migração controlada; esta fase não altera essa configuração.
- `validateUnitHierarchy()` deve ser chamada obrigatoriamente antes de qualquer futura importação ou atualização hierárquica.

## Fontes

- [Decreto nº 1.017 — alterações dos anexos I, II, III e IV](https://www.pm.pa.gov.br/images/PM1/DECRETO_N%C2%BA_1.017_-_ALTERA%C3%87%C3%95ES_DOS_ANEXOS_I_II_III_E_IV_-_20-10-2025.pdf) — 2025-10-20
- [Órgãos de Execução](https://www.pm.pa.gov.br/component/content/article/129-institucional/4229-orgaos-de-execucao.html) — 2023-03-17
- [Boletim Geral nº 14, de 21 de janeiro de 2025](https://www.pm.pa.gov.br/phocadownload/userupload/userupload/jaqueline.38111/BG%20N.%2014%20de%2021%20JAN%202025.pdf) — 2025-01-21
- [Boletim Geral nº 7, de 10 de janeiro de 2025](https://www.pm.pa.gov.br/phocadownload/userupload/userupload/sales.44248/BG%20N.%207%20de%2010%20JAN%202025.pdf) — 2025-01-10
