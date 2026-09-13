# SIGAT — Regras de Desenvolvimento para Agentes

Sistema Integrado de Gestão de Ativos e Tecnologia (SIGAT) — inventário central de equipamentos da Polícia Militar do Pará (PMPA). Backend Express/Mongoose/TypeScript + Frontend React/Vite/TypeScript. Documentação oficial: `Documents/SIGAT-Especificacao-Oficial-v0.1.md` · Contrato da API: `docs/api/openapi.yaml`.

Estas regras valem para qualquer agente (Hermes/Jarvis, Codex, Claude Code, OpenCode) trabalhando neste repositório.

## Regras obrigatórias

1. **Sem Git por enquanto.** O repositório está em stasis (branch `master` sem commits). NÃO criar commits, branches, tags, PRs ou publicações. O versionamento será ativado quando o usuário decidir.
2. **TDD estrito (RED → GREEN → REFACTOR).** Para qualquer feature ou correção: escreva o teste primeiro, rode e VEJA falhar (RED), implemente o mínimo (GREEN), refatore. Nunca implemente antes do teste. Exceção: config/arquivos gerados.
3. **Nunca exponha segredos.** Em respostas de API, logs, testes e docs, nunca inclua `passwordHash`, senhas, tokens, `tokenDigest`, `sessionId` ou caminhos internos de arquivos.
4. **Escopo de unidade SEMPRE no servidor.** O usuário de unidade jamais pode ver, alterar ou excluir dados de outra unidade. O frontend nunca é mecanismo de segurança. Escopo é reaplicado no backend em toda consulta, criação, edição, relatório e anexo.
5. **Auditoria em toda operação de escrita relevante.** Use `recordAuditEvent` com `action`, `module`, `userId`, `actor`, `entity`, `unit`, `result`, `before`/`after`. Ações críticas sempre auditáveis.
6. **Padrão de estrutura (backend):** `models/` (Mongoose) → `repositories/` (queries isoladas, testáveis sem HTTP) → `routes/` (factory `createXxxRoutes`) → `app.ts` (registra). Lógica de negócio em services/operations, repositórios acessam o banco.
7. **Frontend:** `features/<modulo>/api|components|pages` com `shared/api`, `shared/ui`, `shared/auth`. Dados via `httpClient`, queries via React Query, testes com MSW.
8. **Arquivos de código < 500 linhas.** Prefira extrair módulos/helpers a crescer arquivos.
9. **Valide entrada nas fronteiras.** Todo input de usuário no backend é validado (tipos, enums, tamanhos) antes de tocar o banco. Não confie em nada vindo do cliente.
10. **Preserve contratos públicos.** Não altere respostas de API existentes sem atualizar o `openapi.yaml` e os testes que as definem. Para mudanças, atualize spec + testes + código juntos.
11. **Não crie arquivos desnecessários.** Não crie arquivos de documentação, planos ou exemplos sem pedido explícito. Prefira editar arquivos existentes.
12. **Reescrita de histórico preservada.** Movimentações, alterações e exclusões lógicas preservam o histórico. Nunca apague fisicamente dados com histórico.

## Comandos de verificação (rodar ANTES de declarar pronto)

```bash
# Backend (pasta backend/)
npm run typecheck       # tsc --noEmit
npm test                # vitest (serial — obrigatório para estabilidade do MongoDB)
npm run test:integration
npm run build

# Frontend (pasta frontend/)
npm run typecheck       # tsc -b
npm test                # vitest (exclui e2e)
npm run build
npx playwright test     # e2e (Firefox)

# Contrato da API
npx --yes @redocly/cli@1.34.0 lint docs/api/openapi.yaml
```

Depois de mudanças: rode a verificação completa e reporte resultados REAIS (não suponha sucesso).

## Regra de testes (backend)

`npm test` roda com `--no-file-parallelism` (obrigatório: os testes sobem `MongoMemoryServer` por arquivo com conexão global compartilhada; paralelismo causa `ECONNRESET`/timeout). NÃO remova essa flag.

## Contexto do projeto

- Spec oficial: `Documents/SIGAT-Especificacao-Oficial-v0.1.md` (visão, escopo, entidades, fluxos, matriz de permissões).
- Contrato da API: `docs/api/openapi.yaml`.
- Planos de trabalho: `docs/superpowers/plans/` (o mais recente define o próximo passo).
- Orquestração existente (Claude Code/Ruflo) em `.claude/`, `.claude-flow/`, `.swarm/`, `.superpowers/` — não interfere no trabalho direto de código.
- Stack: Express 4.22, Mongoose 8.24, TypeScript 7.0.2 (strict, NodeNext), React 19.2, Vite 8.2, Vitest 4, Playwright 1.62 (Firefox), MSW 2.15.

## Atenção

- Este repositório contém `CLAUDE.md` (regras de orquestração Ruflo/Claude Code) — não o confunda com estas regras de desenvolvimento do SIGAT.
- Use `docs/superpowers/plans/` como fonte dos próximos passos. Nunca implemente módulo sem que estejam definidos objetivo, usuários autorizados, dados, regras, permissões, fluxo e critérios de aceitação (spec §9).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
