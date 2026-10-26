# Integração do modelo do Termo de Transferência de Carga — Design

## Intenção

Atualizar a apresentação dos documentos AC para reproduzir a estrutura do modelo fornecido, mantendo os snapshots históricos de `AcTransfer` como única fonte dos dados patrimoniais.

## Abordagem escolhida

O serviço será dividido em três camadas: modelo patrimonial normalizado, layout semântico compartilhado e renderizadores DOCX/PDF. A alternativa de preencher diretamente um DOCX binário foi descartada porque dificultaria paginação dinâmica e a manutenção do PDF. A alternativa de manter layouts independentes foi descartada porque permitiria divergência entre os formatos.

O layout terá cabeçalho institucional textual, quatro seções numeradas, tabela de bens com descrição/modelo, campos de assinatura e rodapé provisório. O DOCX repetirá a linha de cabeçalho da tabela; o PDF controlará quebra de página e redesenhará o cabeçalho da tabela.

## Restrições

- O documento continua explicitamente provisório e não oficial.
- Nenhuma emissão altera transferência, equipamento, custódia ou histórico.
- Permissões, validações, endpoint e limite de tamanho existentes permanecem.
- O arquivo de referência não será tratado como documento oficial nem alterado.
