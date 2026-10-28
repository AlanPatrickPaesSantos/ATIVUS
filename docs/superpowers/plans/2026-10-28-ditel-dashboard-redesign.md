# Redesign do Dashboard DITEL 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganizar o Dashboard DITEL existente em uma composição escura, compacta e responsiva, sem alterar dados, contratos ou regras de negócio.

**Architecture:** Manter `Dit​elDashboardPage.tsx` como composição funcional única e concentrar a nova hierarquia visual em classes CSS existentes/novas em `modules.css`. Os dados continuarão vindo de `operationalIndicators`, `commandSummaries`, `situations` e `unitSummaries`; apenas a quantidade inicialmente exibida será controlada localmente.

**Tech Stack:** React 19, TypeScript, React Router, Vitest/Testing Library, CSS Grid, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-ditel-dashboard-redesign-design.md`

## Global Constraints

- Não modificar backend, contratos, MongoDB Atlas, permissões ou cálculos.
- Preservar filtros hierárquicos, URL, navegação contextual e estados de carregamento/erro/vazio.
- Exibir inicialmente cinco unidades e cinco itens do ranking, com acesso aos demais.
- Manter a interface em português e acessível por teclado.
- Não incluir dados fictícios ou tendências temporais inexistentes.

## Review Focus

- Recorte sem dados: painéis devem mostrar estados vazios sem acessar propriedades ausentes — coberto por teste de estado vazio.
- Mais de cinco unidades/comandos: controles devem revelar o restante sem duplicar dados — coberto por teste de expansão.
- Mobile estreito: Grid não deve criar overflow horizontal — coberto por Playwright responsivo.
- Filtros na URL: reorganização não pode perder link contextual ou seleção hierárquica — coberto pelos testes existentes e de navegação.
- Indicadores secundários: devem continuar acessíveis sem voltar aos dez cartões — coberto por teste de texto/contagens.

### Task 1: Fixar o comportamento compacto em testes

**Files:**
- Modify: `frontend/src/features/dashboard/pages/DitelDashboardPage.test.tsx`
- Test: `frontend/src/features/dashboard/pages/DitelDashboardPage.test.tsx`

- [ ] Adicionar testes RED para quatro KPIs principais, faixa compacta de indicadores secundários, limite inicial de cinco itens e expansão/recolhimento das listas.
- [ ] Executar o teste focalizado e confirmar falha pela ausência da nova estrutura.

### Task 2: Reorganizar a composição React

**Files:**
- Modify: `frontend/src/features/dashboard/pages/DitelDashboardPage.tsx`

- [ ] Implementar estado local de expansão para unidades e ranking.
- [ ] Renderizar quatro KPIs principais e mover os demais indicadores para uma faixa compacta acessível.
- [ ] Reestruturar a ordem para comparação por comando, distribuição/situação e faixa inferior de unidades/ranking.
- [ ] Preservar filtros, links, estados de loading/error/empty e dados reais.
- [ ] Executar os testes focados até GREEN.

### Task 3: Aplicar o sistema visual responsivo

**Files:**
- Modify: `frontend/src/shared/styles/modules.css`

- [ ] Criar a composição CSS Grid desktop/tablet/mobile, com superfícies azul-marinho, bordas discretas e acentos moderados.
- [ ] Garantir que tabelas/listas compactas não criem overflow horizontal e que os controles de expansão tenham foco visível.
- [ ] Executar testes frontend, typecheck e build.

### Task 4: Validar visualmente e limpar resíduos

**Files:**
- Modify: nenhum arquivo adicional esperado.

- [ ] Executar Playwright dos cenários de dashboard e responsividade.
- [ ] Verificar desktop e mobile, estados de filtro, expansão e navegação contextual.
- [ ] Executar `git diff --check` e confirmar que somente arquivos do redesign foram tocados.
