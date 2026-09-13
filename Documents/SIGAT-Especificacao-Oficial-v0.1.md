# SIGAT — Especificação Oficial do Sistema

**Versão:** 0.1  
**Ano:** 2026  
**Status:** definição inicial do produto

## 1. Visão geral

O SIGAT será um sistema central de inventário e gestão de equipamentos da Polícia Militar do Pará (PMPA).

O sistema reunirá, em uma única plataforma, as informações dos equipamentos pertencentes às unidades da PMPA. A DITEL terá visão administrativa e operacional de todo o Estado do Pará. Cada unidade terá acesso restrito aos seus próprios dados.

O objetivo é substituir controles dispersos por um inventário padronizado, rastreável e auditável.

## 2. Regra central de acesso

### 2.1 DITEL

- A DITEL será o administrador central do sistema.
- Poderá visualizar todas as unidades e equipamentos.
- Poderá cadastrar, revisar, corrigir, movimentar e administrar informações de todo o Estado.
- Poderá consultar dashboards e relatórios estaduais.

### 2.2 Unidades

- Cada unidade terá acesso somente ao próprio ambiente lógico.
- Poderá cadastrar e atualizar os equipamentos sob sua responsabilidade.
- Não poderá visualizar, alterar ou excluir equipamentos de outras unidades.
- O sistema deverá impedir que a unidade altere manualmente seu identificador de unidade para acessar dados externos.

## 3. Escopo funcional inicial

O SIGAT será composto pelos seguintes módulos:

1. Dashboard;
2. Usuários e permissões;
3. Unidades da PMPA;
4. Inventário de equipamentos;
5. Chamados;
6. Movimentações e transferências;
7. Manutenção;
8. Missões técnicas;
9. Relatórios;
10. Auditoria.

Os módulos poderão ser ajustados durante a análise, mas qualquer alteração deverá ser registrada nesta especificação antes da implementação.

## 4. Inventário de equipamentos

O inventário será exclusivamente relacionado aos equipamentos pertencentes ou utilizados pela PMPA.

Exemplos de itens: computadores, notebooks, impressoras, switches, rádios, equipamentos de comunicação, viaturas e outros bens utilizados pela corporação.

Cada equipamento deverá possuir, inicialmente:

- Número de patrimônio;
- Número de série;
- Tipo de equipamento;
- Marca;
- Modelo;
- Unidade responsável;
- Situação;
- Informações de garantia;
- Histórico de movimentações.

Situações iniciais previstas:

- Ativo;
- Em manutenção;
- Baixado;
- Perdido;
- Inativo.

Novas situações poderão ser adicionadas quando houver necessidade operacional comprovada.

## 5. Chamados

O módulo de Chamados permitirá que as unidades comuniquem problemas, solicitações e necessidades técnicas à DITEL.

Cada chamado deverá possuir uma prioridade. No momento da abertura, a unidade poderá selecionar a prioridade inicial. Ao acessar e analisar o chamado, a DITEL poderá alterar essa prioridade conforme a gravidade, urgência e impacto da solicitação.

Prioridades iniciais previstas:

- Baixa;
- Média;
- Alta;
- Crítica.

O chamado deverá manter o histórico das alterações de prioridade, incluindo o usuário responsável, a data e a prioridade anterior e posterior.

A unidade poderá anexar documentos e imagens ao chamado quando forem necessários para explicar o problema ou comprovar a situação. Os anexos deverão ser vinculados ao chamado e registrados no histórico da solicitação.

Quando aplicável, o chamado poderá ser relacionado a um equipamento específico do inventário. O atendimento poderá resultar em encaminhamento para o módulo de Manutenção.

Fluxo básico previsto:

**Unidade abre o chamado → DITEL analisa → prioridade é confirmada ou alterada → chamado é atendido ou encaminhado para manutenção → solução é registrada → chamado é encerrado.**

## 6. Dashboard

O Dashboard será a tela inicial do sistema e apresentará informações conforme o nível de acesso.

### 5.1 Dashboard da DITEL

- Total geral de equipamentos;
- Equipamentos por unidade;
- Equipamentos por tipo;
- Equipamentos por situação;
- Equipamentos em manutenção;
- Equipamentos baixados ou perdidos;
- Garantias próximas do vencimento;
- Últimas movimentações;
- Pendências de manutenção;
- Indicadores de missões técnicas.

### 5.2 Dashboard da unidade

O usuário da unidade visualizará os mesmos tipos de indicadores, limitados exclusivamente aos equipamentos e atividades da própria unidade.

## 7. Princípios do sistema

- Isolamento dos dados entre unidades;
- Visão centralizada para a DITEL;
- Rastreabilidade das movimentações;
- Histórico preservado;
- Permissões baseadas no perfil do usuário;
- Auditoria das ações relevantes;
- Cadastro padronizado de tipos de equipamento;
- Chamados com prioridade ajustável pela DITEL;
- Suporte a documentos e imagens anexados aos chamados;
- Separação entre frontend, backend e banco de dados;
- Desenvolvimento incremental e validado por etapas.

## 8. Diretriz tecnológica inicial

As tecnologias atuais poderão ser mantidas, com ajustes quando necessário:

- Frontend: React com Vite;
- Backend: Node.js com TypeScript;
- Banco de dados: MongoDB;
- Comunicação: API HTTP;
- Arquitetura: frontend e backend separados;
- Autenticação: usuários, perfis e permissões;
- Implantação: definida após a validação da arquitetura.

A escolha definitiva das bibliotecas e da estrutura de pastas será feita antes do início da codificação.

## 9. Regra de desenvolvimento

Nenhum módulo deverá ser implementado sem que estejam definidos:

- objetivo;
- usuários autorizados;
- dados envolvidos;
- regras de negócio;
- permissões;
- fluxo principal;
- critérios de aceitação.

## 10. Relatórios

O SIGAT deverá permitir a geração de relatórios tanto por unidade quanto abrangendo todo o Estado do Pará.

### 10.1 Escopo dos relatórios

- Relatório da própria unidade, para usuários autorizados da unidade;
- Relatório consolidado de todas as unidades, para a DITEL;
- Relatório por tipo de equipamento;
- Relatório por situação do equipamento;
- Relatório de equipamentos em manutenção;
- Relatório de equipamentos baixados, perdidos ou inativos;
- Relatório de garantias;
- Relatório de movimentações;
- Relatório de chamados;
- Relatório de missões técnicas.

### 10.2 Relatórios por filtro

O usuário deverá poder aplicar filtros antes de gerar o relatório. Os filtros disponíveis dependerão do tipo de relatório, mas poderão incluir:

- Unidade;
- Município ou região;
- Tipo de equipamento;
- Marca;
- Modelo;
- Situação;
- Período de cadastro;
- Período de movimentação;
- Garantia;
- Equipamento em manutenção;
- Prioridade e situação do chamado;
- Situação da missão técnica.

Os filtros deverão poder ser combinados para produzir relatórios específicos, como: equipamentos ativos de determinada unidade, rádios em manutenção de uma região ou chamados críticos ainda pendentes.

### 10.3 Controle de acesso aos relatórios

- A DITEL poderá gerar relatórios estaduais ou filtrados por qualquer unidade;
- O usuário da unidade poderá gerar relatórios somente com dados da própria unidade;
- O servidor deverá reaplicar a regra de escopo mesmo que o frontend receba filtros indevidos;
- A geração de relatório deverá respeitar as permissões do usuário.

## 11. Usuários e perfis

O acesso ao SIGAT será controlado por autenticação e permissões associadas ao perfil do usuário.

### 10.1 Administrador DITEL

O administrador da DITEL terá acesso global ao sistema.

Permissões principais:

- Visualizar todas as unidades e equipamentos;
- Cadastrar e administrar unidades;
- Criar, bloquear, editar e desativar usuários;
- Administrar tipos de equipamentos;
- Corrigir ou atualizar informações do inventário;
- Alterar prioridades e acompanhar chamados;
- Administrar movimentações e transferências;
- Gerenciar manutenções e missões técnicas;
- Acessar dashboards, relatórios e auditoria.

### 10.2 Usuário da unidade

O usuário vinculado a uma unidade terá acesso limitado ao escopo da própria unidade.

Permissões principais:

- Visualizar o Dashboard da própria unidade;
- Cadastrar equipamentos da própria unidade;
- Atualizar informações dos equipamentos autorizados;
- Abrir chamados;
- Escolher a prioridade inicial do chamado;
- Anexar documentos e imagens;
- Acompanhar os chamados da própria unidade;
- Consultar o histórico dos equipamentos da própria unidade;
- Solicitar ou acompanhar movimentações autorizadas.

O usuário da unidade não poderá:

- Consultar dados de outras unidades;
- Alterar o vínculo de um equipamento para outra unidade por conta própria;
- Alterar sua própria unidade no sistema;
- Administrar usuários da DITEL;
- Alterar a prioridade de um chamado depois de aberto, salvo autorização específica futura.

Perfis internos adicionais, como operador, técnico ou visualizador, poderão ser criados posteriormente se a rotina da PMPA exigir níveis diferentes dentro da mesma unidade.

## 12. Unidades da PMPA

Cada equipamento deverá estar vinculado a uma unidade responsável.

O cadastro da unidade deverá permitir, no mínimo:

- Nome da unidade;
- Sigla;
- Código identificador;
- Município;
- Região ou estrutura administrativa correspondente;
- Situação ativa ou inativa.

O vínculo da unidade será utilizado para aplicar o isolamento dos dados em todas as consultas, cadastros, atualizações, chamados, relatórios e dashboards.

## 13. Fluxo de cadastro de equipamento

O fluxo inicial será:

1. O usuário acessa o módulo Inventário;
2. O sistema identifica automaticamente a unidade vinculada ao usuário;
3. O usuário seleciona o tipo de equipamento;
4. O usuário informa patrimônio, número de série, marca, modelo, situação e garantia;
5. O sistema valida os campos obrigatórios;
6. O sistema verifica possíveis duplicidades de patrimônio e número de série;
7. O equipamento é salvo vinculado à unidade do usuário;
8. O sistema registra a criação no histórico e na auditoria;
9. O equipamento passa a aparecer no Dashboard e nas listagens permitidas.

### 12.1 Regras de segurança do cadastro

- A unidade do equipamento será definida pelo servidor, e não pelo formulário do frontend;
- O usuário não poderá enviar outro identificador de unidade para escapar do próprio escopo;
- O número de patrimônio deverá ser único conforme a regra patrimonial definida pela DITEL;
- O número de série deverá ser único quando informado;
- Alterações relevantes deverão gerar histórico;
- Exclusões físicas não deverão ser utilizadas para apagar o histórico do equipamento.

## 14. Critérios iniciais de aceitação

O núcleo inicial será considerado correto quando:

- Um administrador DITEL conseguir consultar equipamentos de todas as unidades;
- Um usuário de unidade conseguir consultar somente os equipamentos da própria unidade;
- O servidor impedir acesso utilizando outro identificador de unidade;
- A unidade conseguir cadastrar equipamentos sem informar ou escolher outra unidade;
- O sistema impedir duplicidade de patrimônio;
- O sistema registrar o histórico da criação e das alterações;
- O Dashboard respeitar o mesmo isolamento aplicado às demais telas;
- Um chamado puder ser aberto pela unidade com prioridade e anexos;
- A DITEL puder revisar o chamado e alterar sua prioridade.
- A DITEL puder gerar relatórios estaduais e filtrados por unidade;
- Uma unidade puder gerar relatórios somente com seus próprios dados;
- O sistema puder combinar filtros antes da geração do relatório.

## 15. Entidades principais e campos iniciais

Os campos abaixo representam a primeira definição do modelo de dados. Eles poderão ser refinados antes da implementação, mas nenhuma entidade deverá ser criada no código sem validação desta especificação.

### 15.1 Unidade

- Identificador;
- Nome;
- Sigla;
- Código;
- Município;
- Região ou estrutura administrativa;
- Endereço ou localização administrativa;
- Situação: ativa ou inativa;
- Data de criação;
- Data da última atualização.

### 15.2 Usuário

- Identificador;
- Nome completo;
- Nome de guerra, quando aplicável;
- Login ou e-mail;
- Matrícula, quando aplicável;
- Senha armazenada de forma segura;
- Perfil ou função;
- Unidade vinculada, quando for usuário de unidade;
- Situação: ativo ou bloqueado;
- Indicador de troca obrigatória de senha;
- Data do último acesso;
- Data de criação;
- Data da última atualização.

### 15.3 Equipamento

- Identificador;
- Número de patrimônio;
- Número de série;
- Tipo de equipamento;
- Marca;
- Modelo;
- Unidade responsável;
- Situação;
- Informações de garantia;
- Data de cadastro;
- Usuário responsável pelo cadastro;
- Observações;
- Data de criação;
- Data da última atualização.

### 15.4 Movimentação

A movimentação registrará qualquer alteração relevante relacionada à localização, unidade ou responsabilidade do equipamento.

- Identificador;
- Equipamento;
- Unidade de origem;
- Unidade de destino, quando aplicável;
- Tipo de movimentação;
- Motivo;
- Usuário responsável;
- Data da movimentação;
- Observações;
- Documentos ou comprovantes, quando aplicável.

As movimentações deverão preservar o histórico e não poderão ser apagadas de forma a ocultar a trajetória do equipamento.

### 15.5 Chamado

- Identificador;
- Número ou protocolo;
- Unidade solicitante;
- Usuário que abriu o chamado;
- Equipamento relacionado, quando aplicável;
- Título;
- Descrição;
- Prioridade;
- Situação do chamado;
- Responsável pelo atendimento;
- Histórico de alterações;
- Data de abertura;
- Data da última atualização;
- Data de encerramento, quando aplicável.

Situações iniciais previstas:

- Aberto;
- Em análise;
- Em atendimento;
- Aguardando informação;
- Encaminhado para manutenção;
- Resolvido;
- Encerrado;
- Cancelado.

### 15.6 Anexo

Os anexos poderão ser vinculados a chamados e, quando necessário, a movimentações ou outros registros autorizados.

- Identificador;
- Chamado ou registro relacionado;
- Nome original do arquivo;
- Tipo do arquivo;
- Tamanho;
- Local seguro de armazenamento;
- Usuário que realizou o envio;
- Data do envio;
- Situação do anexo.

O sistema deverá validar o tamanho e os tipos de arquivo permitidos, além de impedir acesso a anexos sem autorização.

### 15.7 Manutenção

O registro de manutenção deverá permitir acompanhar a intervenção realizada em um equipamento.

- Identificador;
- Equipamento;
- Chamado de origem, quando aplicável;
- Tipo de manutenção;
- Descrição do problema;
- Diagnóstico;
- Serviço realizado;
- Responsável técnico;
- Situação da manutenção;
- Data de entrada;
- Data de conclusão, quando aplicável;
- Observações;
- Anexos e laudos, quando aplicável.

### 15.8 Missão técnica

- Identificador;
- Título ou finalidade;
- Unidade ou unidades envolvidas;
- Local;
- Data de início;
- Data de término;
- Equipe responsável;
- Equipamentos utilizados, quando aplicável;
- Situação da missão;
- Descrição;
- Resultado ou relatório final;
- Anexos, quando aplicável.

## 16. Fluxos principais e regras de negócio

### 16.1 Login

1. O usuário informa login e senha;
2. O sistema valida as credenciais;
3. O sistema verifica se o usuário está ativo;
4. O sistema identifica o perfil e a unidade vinculada;
5. O sistema cria a sessão autenticada;
6. O usuário é direcionado ao Dashboard correspondente ao seu escopo.

Regras:

- Usuário bloqueado não poderá acessar o sistema;
- O usuário deverá trocar a senha no primeiro acesso quando essa exigência estiver ativa;
- O administrador DITEL acessará o escopo estadual;
- O usuário de unidade acessará somente o escopo da própria unidade;
- O encerramento da sessão deverá invalidar o acesso correspondente.

### 16.2 Cadastro de unidade

1. O administrador DITEL acessa o cadastro de unidades;
2. Informa os dados administrativos da unidade;
3. O sistema valida nome, sigla e código;
4. O sistema verifica duplicidade;
5. A unidade é criada como ativa;
6. O sistema registra a ação na auditoria.

Somente usuários autorizados da DITEL poderão criar, editar, ativar ou inativar unidades.

### 16.3 Cadastro de usuário

1. O administrador autorizado acessa o cadastro de usuários;
2. Informa os dados pessoais e funcionais;
3. Seleciona o perfil;
4. Vincula o usuário a uma unidade quando necessário;
5. O sistema gera ou registra a senha inicial de forma segura;
6. O usuário é criado com a troca de senha inicial ativada;
7. O sistema registra a ação na auditoria.

Regras:

- Usuário de unidade deverá possuir uma unidade vinculada;
- Usuário DITEL não deverá ser limitado a uma unidade operacional;
- Usuários inativos não poderão autenticar;
- A desativação deverá encerrar sessões ativas do usuário;
- O sistema deverá preservar o histórico do usuário.

### 16.4 Cadastro de equipamento

1. O usuário acessa o inventário;
2. Seleciona o tipo de equipamento;
3. Preenche os dados patrimoniais e técnicos;
4. O servidor determina a unidade responsável pelo usuário;
5. O sistema valida patrimônio e número de série;
6. O equipamento é salvo como ativo, salvo indicação diferente autorizada;
7. A criação é registrada no histórico e na auditoria.

Regras:

- O usuário não poderá escolher outra unidade no formulário;
- A unidade responsável será definida pelo servidor;
- O patrimônio não poderá ser duplicado dentro da base definida pela DITEL;
- O número de série não poderá ser duplicado quando informado;
- Alterações de unidade deverão ocorrer por movimentação formal;
- O equipamento não deverá ser apagado fisicamente quando já possuir histórico.

### 16.5 Abertura de chamado

1. O usuário da unidade acessa o módulo de Chamados;
2. Informa título e descrição;
3. Seleciona a prioridade inicial;
4. Relaciona um equipamento, se necessário;
5. Anexa documentos ou imagens, se necessário;
6. Envia o chamado;
7. O sistema gera um protocolo;
8. O chamado é criado como aberto;
9. A unidade e a DITEL podem acompanhar o chamado conforme suas permissões.

### 16.6 Atendimento de chamado pela DITEL

1. A DITEL acessa a fila de chamados;
2. Filtra por unidade, prioridade ou situação;
3. Lê a descrição e consulta os anexos;
4. Confirma ou altera a prioridade;
5. Registra análise e responsável;
6. Responde, resolve ou encaminha para manutenção;
7. O sistema registra todas as alterações no histórico;
8. O chamado é encerrado após a solução ser registrada.

Regras:

- A alteração de prioridade deverá registrar o valor anterior e o novo valor;
- A unidade poderá acompanhar o histórico do próprio chamado;
- Chamados não poderão ser apagados fisicamente;
- O encerramento deverá exigir uma descrição da solução;
- Anexos deverão respeitar as regras de segurança e permissão.

## 17. Matriz inicial de permissões

Nesta primeira versão serão considerados dois escopos principais: Administrador DITEL e Usuário da unidade. Perfis internos adicionais poderão ser criados posteriormente sem alterar a regra central de isolamento.

| Módulo ou ação | Administrador DITEL | Usuário da unidade |
|---|---|---|
| Dashboard | Visualiza dados estaduais e por unidade | Visualiza somente a própria unidade |
| Usuários | Cria, edita, bloqueia e consulta | Não administra usuários |
| Unidades | Cria, edita, ativa, inativa e consulta | Consulta apenas a própria unidade |
| Tipos de equipamento | Cria, edita e inativa | Consulta e seleciona no cadastro |
| Equipamentos | Consulta e administra todo o Estado | Cadastra e atualiza equipamentos da própria unidade |
| Movimentações | Cria, aprova, acompanha e administra | Solicita e acompanha conforme autorização |
| Chamados | Consulta, responde, altera prioridade e encerra | Abre, acompanha e complementa os próprios chamados |
| Anexos | Consulta anexos autorizados | Envia e consulta anexos dos próprios chamados |
| Manutenção | Administra e acompanha | Solicita e acompanha equipamentos da própria unidade |
| Missões técnicas | Cria, administra e consulta | Consulta ou participa quando autorizado |
| Relatórios | Gera relatórios estaduais e por unidade | Gera relatórios somente da própria unidade |
| Auditoria | Consulta os registros autorizados de todo o sistema | Não acessa a auditoria global |

### 17.1 Regras gerais da matriz

- Toda permissão deverá ser validada no backend;
- O frontend não será considerado mecanismo de segurança;
- O escopo da unidade deverá ser aplicado em consultas, criações, edições, exclusões lógicas, relatórios e anexos;
- O usuário da unidade não poderá alterar o vínculo da própria conta;
- O administrador DITEL não deverá ser limitado ao escopo de uma unidade;
- Ações críticas deverão ser registradas na auditoria;
- Novos perfis deverão receber permissões explícitas, sem acesso automático a todos os módulos.

## 18. Critérios de aceitação por módulo

### Dashboard

- Exibe dados conforme o escopo do usuário;
- Não revela indicadores de outras unidades para usuários de unidade;
- Permite acesso às listagens correspondentes quando o usuário possuir autorização.

### Inventário

- Permite cadastrar equipamentos;
- Impede patrimônio duplicado;
- Mantém histórico;
- Restringe dados por unidade;
- Permite administração global à DITEL.

### Chamados

- Permite abertura pela unidade;
- Permite prioridade inicial;
- Permite alteração da prioridade pela DITEL;
- Permite documentos e imagens;
- Mantém histórico e protocolo;
- Permite encaminhamento para manutenção.

### Relatórios

- Permite relatório estadual para a DITEL;
- Permite relatório da própria unidade;
- Permite filtros combinados;
- Respeita as permissões mesmo com parâmetros indevidos enviados pelo usuário.

## 19. Arquitetura técnica inicial

### 19.1 Estrutura geral

O projeto será organizado em duas aplicações principais:

- `frontend`: interface utilizada pela DITEL e pelas unidades;
- `backend`: API responsável por autenticação, regras de negócio, permissões, persistência e auditoria.

O frontend não deverá acessar o banco de dados diretamente. Toda operação deverá passar pela API do backend.

### 19.2 Tecnologias-base

- Frontend: React com Vite e TypeScript;
- Backend: Node.js com TypeScript;
- API: HTTP, preferencialmente REST na primeira versão;
- Banco de dados: MongoDB;
- ODM: Mongoose ou alternativa equivalente, conforme validação técnica;
- Autenticação: sessão autenticada com access token e refresh token;
- Validação: schemas no backend;
- Armazenamento de anexos: abstração que permita armazenamento local e serviço externo;
- Relatórios: geração em formatos definidos durante a implementação;
- Logs: registro de erros e eventos técnicos;
- Auditoria: coleção ou estrutura própria para ações relevantes.

### 19.3 Organização inicial do backend

```text
backend/
├── src/
│   ├── config/
│   ├── database/
│   ├── models/
│   ├── repositories/
│   ├── services/
│   ├── controllers/
│   ├── routes/
│   ├── middlewares/
│   ├── validators/
│   ├── types/
│   ├── interfaces/
│   ├── utils/
│   ├── logs/
│   └── app.ts
└── package.json
```

### 19.4 Organização inicial do frontend

```text
frontend/
├── src/
│   ├── components/
│   ├── layouts/
│   ├── pages/
│   ├── features/
│   ├── services/
│   ├── hooks/
│   ├── contexts/
│   ├── routes/
│   ├── types/
│   ├── utils/
│   └── main.tsx
└── package.json
```

### 19.5 Segurança obrigatória

- Senhas nunca poderão ser armazenadas em texto puro;
- Permissões deverão ser verificadas no backend;
- Dados da unidade deverão ser filtrados no servidor;
- Tokens revogados não poderão continuar autorizando requisições;
- Uploads deverão validar extensão, tipo e tamanho;
- Segredos deverão ficar em variáveis de ambiente;
- Erros não deverão expor dados sensíveis;
- Ações críticas deverão gerar auditoria;
- Exclusões de registros históricos deverão ser lógicas ou proibidas.

## 20. Ordem inicial de implementação

### Fase 1 — Fundação do projeto

- Criar frontend e backend;
- Configurar TypeScript, lint, formatação e variáveis de ambiente;
- Configurar conexão com MongoDB;
- Criar tratamento global de erros;
- Criar padrão de respostas da API;
- Configurar logs básicos.

### Fase 2 — Autenticação e autorização

- Usuário;
- Perfis e permissões;
- Login e logout;
- Sessões e renovação de token;
- Middleware de autenticação;
- Middleware de escopo da unidade;
- Usuário administrador inicial da DITEL.

### Fase 3 — Unidades e usuários

- Cadastro de unidades;
- Cadastro e bloqueio de usuários;
- Vínculo entre usuário e unidade;
- Regras de ativação e inativação;
- Auditoria administrativa.

### Fase 4 — Inventário

- Tipos de equipamento;
- Cadastro de equipamentos;
- Listagem e filtros;
- Situações;
- Validação de patrimônio e número de série;
- Histórico de alterações.

### Fase 5 — Dashboard

- Indicadores da DITEL;
- Indicadores da unidade;
- Filtros respeitando o escopo;
- Listagens de apoio.

### Fase 6 — Chamados e anexos

- Abertura de chamado;
- Prioridades;
- Alteração de prioridade pela DITEL;
- Histórico;
- Anexos de documentos e imagens;
- Encaminhamento para manutenção.

### Fase 7 — Movimentações e manutenção

- Transferências;
- Registro de origem e destino;
- Aprovação;
- Manutenção;
- Diagnóstico, serviço e conclusão;
- Histórico patrimonial.

### Fase 8 — Missões, relatórios e auditoria

- Missões técnicas;
- Relatórios por unidade;
- Relatórios estaduais;
- Filtros combinados;
- Auditoria completa;
- Exportações e impressão.

Cada fase deverá ser concluída com testes e revisão das regras antes do início da fase seguinte.

## 21. Status da Fase 1

Foi criada a fundação inicial do projeto com:

- Diretório `frontend/` separado do `backend/`;
- Backend HTTP mínimo;
- Frontend mínimo;
- Configuração inicial de TypeScript no backend;
- Scripts básicos de desenvolvimento, build e execução;
- Documentação técnica complementar em `docs/`.

Foi concluída a primeira fatia executável do backend: autenticação por sessão, cookie HttpOnly, persistência MongoDB, auditoria, autorização por escopo do dashboard e documentação operacional. Os módulos funcionais de inventário, chamados, relatórios e migrações permanecem planejados para as fases seguintes.

## 22. Próximo passo

O próximo passo é iniciar os módulos funcionais previstos na Fase 2, preservando o contrato OpenAPI e os fluxos já consumidos pelo frontend. A execução local do backend, suas variáveis de ambiente e limitações atuais estão documentadas em `backend/README.md`.
