# Etapa 3.5 — Documentos e Relatórios Patrimoniais

## Intenção

Evoluir os documentos patrimoniais e relatórios gerenciais a partir das fontes e contratos existentes, sem alterar custódia, locks, transações ou processos administrativos.

## Abordagem aprovada

A implementação será incremental e sem coleção adicional.

Na Fase 3.5A, o gerador AC existente continuará sendo a única fonte do conteúdo documental. O template será identificado como `ac-transfer-v1`, seguirá marcado como `MODELO PROVISÓRIO - NÃO OFICIAL` e continuará compatível com snapshots legados. Emissões e reemissões bem-sucedidas serão registradas na auditoria existente com operação, versão, responsável, data, identificador único e SHA-256 separado para PDF e DOCX quando calculável. A auditoria não representa armazenamento permanente do arquivo.

Na Fase 3.5B, os relatórios manterão os contratos públicos sempre que possível, mas aceitarão datas reais `from` e `to` com validação inclusiva. Inventário, chamados e movimentações aplicarão os filtros no MongoDB. Agregações e consultas limitadas substituirão carregamentos completos quando o resultado puder ser calculado no banco. A tela e a exportação de inventário usarão o mesmo recorte.

## Alternativas descartadas

- Registro documental dedicado: exigiria coleção, índices, retenção e decisão de armazenamento de arquivos não solicitados.
- Fachada sem rastreabilidade: não atenderia versionamento e registro de emissão.

## Não objetivos

- Assinatura digital ou simulação de assinatura.
- Declaração de validade institucional.
- Reescrita de documentos históricos.
- Geração automática durante consultas sem ação explícita de download.
- Novos indicadores sem definição comprovável no domínio.

## Segurança e compatibilidade

As permissões existentes serão aplicadas no backend. Transferências AC devem continuar confirmadas para geração documental; documentos não serão gerados para operações pendentes. A fonte dos relatórios continuará sendo inventário, chamados, movimentações e demais coleções existentes. Nenhum dado de produção será alterado.

## Critérios de aceitação

- 3.5A diferencia `ac-transfer-v1`, PDF e DOCX, registra somente sucessos, preserva reemissão e mantém o aviso provisório.
- 3.5A rejeita perfis sem permissão e não altera a transferência de origem.
- 3.5B aceita períodos personalizados válidos, rejeita datas inválidas/invertidas e aplica escopo antes dos cálculos.
- 3.5B mantém consistência entre prévia e exportação e não carrega registros ilimitados para calcular indicadores.
