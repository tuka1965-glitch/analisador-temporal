# Analisador Temporal SINESP VDE

Este workspace recebeu o pacote `sinesp vde new 2.twbx` e ele foi extraido em `tableau_extract/`.

O workbook aponta para uma base original chamada `BancoVDE 2015.xlsx` e contem um extrato Tableau `.hyper`. Os campos identificados foram:

- `uf`
- `municipio`
- `evento`
- `data_referencia`
- `agente`
- `arma`
- `faixa_etaria`
- `feminino`
- `masculino`
- `nao_informado`
- `total_vitima`
- `total`
- `total_peso`
- `abrangencia`
- `formulario`

## Como usar

1. Abra `index.html` no navegador.
2. Clique em **Abrir CSV**.
3. Selecione um CSV exportado do Tableau ou da fonte original.
4. Confirme os campos:
   - Data: `data_referencia`
   - Valor: `total_vitima` ou `total`
   - Formato da data: comece com `Automatico`; se os meses ficarem errados, teste `Dia/Mes/Ano` ou `Mes/Dia/Ano`
   - Campo UF: `uf`, quando existir
   - Campo indicador: `evento`, quando existir
   - Filtro extra: `municipio`, `arma`, `agente`, `faixa_etaria` ou `(sem comparacao)`
5. Clique em **Analisar**.

O painel mostra quantas linhas foram ignoradas. Se esse numero for alto, o problema quase sempre esta no formato da data ou em valores numericos exportados como texto.

A secao **Analise automatica** escreve alguns paragrafos sobre tendencia, volatilidade, sazonalidade mensal, quebras abruptas e pontos anômalos. Use o botao **Copiar** para levar o texto para um relatorio ou documento.

A secao **Generalizacao territorial** compara uma janela pre e uma janela pos por UF. Ela calcula a variacao de cada estado, a mediana estadual, a variacao nacional agregada e classifica o padrao como queda generalizada, queda ampla mas desigual, queda concentrada, estabilidade ampla, padrao divergente ou mudanca heterogenea.

Para testar a pergunta sobre homicidios depois de 2017:

- Pre inicio: `2015`
- Pre fim: `2017`
- Pos inicio: `2018`
- Pos fim: `2020` ou outro ano final desejado
- Limiar relevante: `10`

Depois selecione o indicador de homicidios no filtro **Indicador**. Se a queda nacional vier acompanhada de queda na mediana estadual e em grande parte das UFs, o app classifica como tendencia generalizada. Se o agregado nacional cair mas a mediana estadual nao cair, a leitura aponta concentracao em poucas UFs.

Para o arquivo `grafico vitmas (3)_data.csv` baixado do Tableau Public, use:

- Data: `Mês de Data Referencia`
- Valor: `Total Vitima`
- Formato da data: `Automatico`
- Campo UF: `(nenhum)`
- Campo indicador: `(nenhum)`
- Filtro extra: `(sem comparacao)`

## CSV completo por UF e indicador

Para analisar os 28 indicadores por UF, exporte ou monte um CSV com pelo menos estas colunas:

- `data_referencia`
- `uf`
- `evento`
- `total_vitima` ou `total`

No app, use:

- Campo UF: `uf`
- Campo indicador: `evento`
- Filtro extra: opcional, por exemplo `municipio`, `arma`, `agente` ou `faixa_etaria`

O arquivo `.twbx` contem esses campos, mas as linhas estao dentro de um extrato `.hyper`. O navegador nao consegue ler esse formato diretamente sem a API do Tableau; por isso o fluxo operacional ainda e exportar a base/crosstab completa para CSV e carregar no app.

## Como obter o CSV no Tableau Public

1. Abra a visualizacao no Tableau Public.
2. Use **Download > Dados** ou **Download > Crosstab**.
3. Se necessario, clique antes em uma marca, tabela, mapa ou grafico para habilitar os dados da selecao.
4. Baixe em CSV e carregue no app.

## Observacao

O arquivo `.hyper` dentro do `.twbx` e um formato proprietario do Tableau. Para extrair todas as linhas automaticamente, e necessario instalar o Tableau Hyper API, Tableau Desktop, Tableau Prep ou exportar o CSV pelo Tableau Public/Desktop.
