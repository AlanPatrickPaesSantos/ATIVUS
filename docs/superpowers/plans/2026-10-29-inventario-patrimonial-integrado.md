# Inventário Patrimonial Integrado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrar a consulta patrimonial somente leitura ao modal existente de detalhes do inventário.

**Architecture:** Reutilizar o `EquipmentDetailModal` e acrescentar um painel `PatrimonialOverview` alimentado por `getPatrimonialView`. O painel mantém paginação independente do histórico, apresenta custódia persistida separada de operações ativas e só renderiza auditoria quando o chamador autoriza o perfil DITEL.

**Tech Stack:** React, TypeScript, React Router, Vitest, Testing Library, MSW.

**Spec:** ATIVUS 2.0 — Etapa 3.3 user request.

## Global Constraints

- Não modificar Atlas, Render, locks, transações, custódia ou coleções.
- Não adicionar escrita patrimonial.
- Preservar Etapas 3.1 e 3.2, worktrees e alterações locais existentes.
- Não executar commit, push ou deploy.

## Review Focus

- Custódia persistida permanece distinta de operação pendente.
- Unidade não recebe eventos de auditoria.
- Histórico é paginado e respostas atrasadas não substituem a seleção atual.
- Estado vazio, erro, loading e navegação contextual usam identificadores reais.
- Modal permanece utilizável em telas pequenas e por teclado.

### Task 1: Painel integrado

Criar `PatrimonialOverview` com consulta paginada, cartões de custódia/operação, histórico, chamados, documentos e auditoria autorizada.

### Task 2: Integração no detalhe

Adicionar o painel ao `EquipmentDetailModal`, passar autorização DITEL a partir do inventário e registrar a rota contextual para a Central.

### Task 3: Fixtures e validação

Atualizar MSW e testes do modal/inventário, validar typecheck, suítes, builds e diff.
