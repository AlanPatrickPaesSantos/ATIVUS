# Integração do modelo do Termo de Transferência de Carga Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reproduzir no DOCX/PDF da AC a estrutura do modelo fornecido sem acoplar layout à lógica patrimonial.

**Architecture:** `AcTransferDocumentModel` continuará normalizando snapshots; `AcTransferDocumentLayout` converterá esse modelo em seções e linhas semânticas; renderizadores DOCX e PDF consumirão o mesmo layout. A tabela de bens terá cabeçalho repetível em ambos os formatos.

**Tech Stack:** TypeScript, `docx`, `pdfkit`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-ac-transfer-document-template-design.md`

## Global Constraints

- Não modificar produção, banco ou migrações.
- Não alterar Movement/DITEL.
- Não emitir assinatura real nem inventar modelo oficial.
- Preservar permissões, validação, snapshots e endpoint da Fase 6.1.
- Manter arquivos de código abaixo de 500 linhas.

## Review Focus

- Transferência com 90+ bens deve paginar e repetir o cabeçalho da tabela.
- Snapshot legado sem identificação/modelo deve continuar sendo emitido sem consultar Equipment.
- BG ausente deve aparecer explicitamente como não informado.
- Conteúdo com caracteres de controle/markup deve continuar sanitizado.
- Reemissão deve produzir documento sem alterar `updatedAt` ou estado patrimonial.

### Task 1: Layout compartilhado e renderizadores

**Files:**
- Modify: `backend/src/services/acTransferDocuments.ts`
- Test: `backend/src/services/acTransferDocumentModel.test.ts`

- [x] Escrever testes RED para seções, descrição, assinaturas e paginação.
- [x] Implementar layout semântico compartilhado e renderização visual baseada no modelo.
- [ ] Executar testes focados e suíte completa.

### Task 2: Exemplos fictícios e verificação

**Files:**
- No código adicional; arquivos de saída temporários fora do repositório.

- [ ] Gerar DOCX/PDF fictícios para revisão.
- [ ] Executar typecheck, builds, testes, E2E, OpenAPI lint e audits.
- [ ] Conferir diff, regressões e ausência de alterações patrimoniais.
