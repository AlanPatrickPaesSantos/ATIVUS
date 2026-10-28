# Redesign do Dashboard DITEL 2.0 — Design

## Intenção

Reorganizar visualmente o Dashboard DITEL existente para uma leitura executiva compacta, inspirada em dashboards administrativos escuros: azul-marinho profundo, superfícies discretas, acentos controlados e hierarquia clara. A fonte dos dados, os filtros, os contratos e as regras de negócio permanecem inalterados.

## Estrutura proposta

- Cabeçalho compacto e filtros hierárquicos preservados.
- Faixa de quatro KPIs principais: total, em operação, em atenção e percentual em atenção.
- Indicadores secundários (manutenção, inativos, perdidos, baixados, chamados e movimentações) reunidos em uma faixa compacta, sem cartões redundantes.
- Painel amplo de comparação por comando, usando `commandSummaries` e barras horizontais.
- Dois painéis menores para distribuição por situação e atenção patrimonial.
- Faixa inferior em duas colunas: cinco unidades monitoradas inicialmente e Top 5 do ranking de atenção, com expansão para acessar os demais registros.

## Decisões visuais e de interação

- CSS Grid responsivo: múltiplas colunas no desktop, duas colunas no tablet e uma coluna no mobile.
- Sem gráficos históricos inventados; somente agregações atuais já fornecidas pela API.
- Listas limitadas a cinco itens por padrão, com controles acessíveis de “Ver todas”/“Mostrar menos”.
- Foco de teclado, rótulos existentes, estados vazio/erro/carregamento e navegação contextual preservados.
- A implementação modifica apenas frontend e estilos diretamente relacionados ao dashboard.

## Não objetivos

- Não alterar backend, OpenAPI, MongoDB Atlas, permissões ou cálculos.
- Não criar uma segunda variante paralela do dashboard.
- Não incluir marcas, textos ou dados do template de referência.
