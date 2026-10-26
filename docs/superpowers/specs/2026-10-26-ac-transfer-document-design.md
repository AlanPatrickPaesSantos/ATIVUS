# Documentos de transferência de carga AC — Fase 6.1

## Intenção

Permitir que uma transferência AC já confirmada seja exportada como DOCX editável ou PDF, usando exclusivamente os dados imutáveis de `AcTransfer`. O resultado é um modelo provisório de trabalho, não um documento oficial da PMPA.

## Abordagem escolhida

O servidor gera DOCX com `docx` e PDF com `pdfkit`, ambos MIT e compatíveis com Node/TypeScript, sem LibreOffice, Chromium ou caminhos de template configuráveis pelo cliente. A geração recebe um snapshot público normalizado e retorna `Buffer`; o endpoint valida ID, sessão, formato e limite de tamanho antes de responder.

## Conteúdo e histórico

O documento conterá a marca “NÃO OFICIAL — MODELO PROVISÓRIO”, origem AC, destino, data, entregador, recebedor, BG quando existente, tabela de RP, N/S, identificação e modelo, além de espaços de assinatura não preenchidos. Novas distribuições passam a guardar `identification` e `model` no snapshot; transferências antigas sem esses campos continuam exportáveis com “Não informado”, sem consulta posterior a `Equipment`.

## Segurança e limites

- somente `ac_operator` e `ditel_admin` exportam;
- `unit_user` recebe 403;
- formato limitado a `docx` ou `pdf`;
- ID validado com `mongoose.isValidObjectId`;
- texto é tratado como dados, sem HTML/XML/SQL interpretável;
- não há caminho, arquivo, template ou script recebido do cliente;
- o limite existente de 500 bens por transferência e limite de saída de 10 MiB evitam documentos descontrolados;
- exportação não altera `AcTransfer`, `Equipment`, custódia, estoque ou auditoria de escrita.

## Não escopo

Modelo institucional validado, brasão oficial, assinatura digital, DOCX/PDF oficial, armazenamento de documentos e alteração do fluxo `Movement/DITEL` ficam para fases posteriores.
