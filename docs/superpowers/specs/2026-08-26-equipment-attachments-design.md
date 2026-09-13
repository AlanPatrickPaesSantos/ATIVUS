# Anexos de equipamentos — entrega frontend

## Objetivo

Permitir que o usuário selecione documentos diretamente no cadastro de um equipamento e visualize os documentos vinculados em seus detalhes. Esta entrega é estritamente de frontend: os arquivos e metadados são simulados no estado local/MSW, sem armazenamento, download real ou API de produção.

São aceitos PDF, JPG e PNG, com até cinco arquivos de 15 MiB por arquivo.

## Escopo desta entrega

- Inclusão de uma etapa **Anexos** no cadastro de equipamento, antes da revisão.
- Seleção por botão e arrastar/soltar, fila visual, validação e remoção antes da confirmação.
- Exibição dos anexos simulados em **Documentos vinculados** nos detalhes do equipamento.
- Atualização dos contratos e mocks do frontend para que os componentes já tenham uma interface pronta para a futura API.
- Testes de validação e dos estados principais da interface.

Não fazem parte desta etapa: backend, banco de dados, armazenamento físico, URL de download, autorização real, auditoria persistida, varredura antimalware, DOC/DOCX, WEBP e exclusão física de arquivos.

## Regras de interface

- Tipos aceitos: PDF, JPG e PNG.
- Máximo de cinco arquivos por equipamento.
- Máximo de 15 MiB por arquivo (`15 * 1024 * 1024` bytes).
- Arquivo inválido não entra na fila; arquivos válidos já selecionados permanecem nela.
- A fila mostra nome, tipo, tamanho e ação **Remover**.
- Na revisão, aparecem a quantidade e os nomes dos anexos selecionados.
- Ao concluir o fluxo demonstrativo, os metadados são associados ao equipamento no mock do frontend para que apareçam em seus detalhes.
- A ação de download será visual/inativa nesta fase, sem fingir que existe um arquivo real disponível.

## Fluxo de uso

1. O usuário preenche identificação, alocação e demais dados do equipamento.
2. Na etapa **Anexos**, seleciona ou arrasta até cinco arquivos.
3. O navegador valida tipo, tamanho e quantidade e explica qualquer rejeição.
4. O usuário pode remover itens da fila antes de seguir.
5. A revisão apresenta os dados e documentos escolhidos.
6. Ao confirmar, o mock de cadastro inclui metadados de cada documento na representação do equipamento.
7. Em **Detalhes do equipamento**, a seção **Documentos vinculados** exibe esses metadados.

## Modelo de dados de frontend

Cada documento no contrato do frontend deve conter identificador temporário, nome original, tipo MIME, tamanho, data de inclusão e status `active`. Durante esta fase, o objeto `File` é usado somente enquanto o formulário está aberto; após a confirmação, a tela mantém apenas metadados simulados.

O componente de documentos não deve depender de uma URL pública. A futura API poderá acrescentar uma ação de download autorizada sem exigir alteração de layout ou das regras de validação.

## Estados e mensagens

- Tipo não permitido: informar que somente PDF, JPG e PNG são aceitos.
- Arquivo acima de 15 MiB: informar o limite por arquivo.
- Sexto arquivo: informar o limite de cinco anexos.
- Falha simulada de cadastro: preservar formulário e fila para nova tentativa.
- Nenhum anexo: continuar permitindo o cadastro, pois anexos são opcionais.

## Testes de aceite

- Selecionar PDF, JPG e PNG válidos e vê-los na fila.
- Rejeitar WEBP, DOCX, arquivos acima de 15 MiB e um sexto item.
- Remover um arquivo da fila antes da revisão.
- Confirmar o cadastro demonstrativo e conferir os documentos vinculados nos detalhes do equipamento.
- Confirmar que documentos vinculados exibem apenas metadados simulados e não prometem download real.

## Etapa futura de backend

Quando houver API e armazenamento, esta mesma experiência será conectada a upload autenticado, armazenamento privado, download autorizado, auditoria e remoção lógica. Essas capacidades não são implementadas nem simuladas como prontas nesta entrega.
