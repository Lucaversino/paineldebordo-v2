# Cartas Raster DHN/CHM — RS, SC, SP e RJ

Este pacote prepara o download das **Cartas Raster KAP/BSB oficiais** do Centro de Hidrografia da Marinha (CHM).

## O que está incluído

- Rio Grande do Sul
- Santa Catarina
- São Paulo
- Rio de Janeiro
- Cartas de transição do Paraná para não deixar lacuna SC ↔ SP
- Cartas gerais 21070 e 21080 para cobertura costeira ampla

O `manifest.json` contém a relação das cartas selecionadas.

## 1. Baixar

Requer Node.js 18 ou mais novo:

```bash
node 01_baixar_cartas.mjs
```

O script NÃO usa nomes de arquivo fixos. Ele entra na tabela oficial e resolve a versão atual da carta.
Isso é importante porque o CHM altera nomes como `_0`, `_1`, `_2`, `_3` quando publica atualizações.

Os ZIPs ficam em:

```text
downloads/_TODAS/
```

## 2. Extrair KAP/BSB

```bash
python 02_extrair_kap.py
```

Resultado:

```text
kap/<numero-da-carta>/
```

## 3. Usar em projeto web

O navegador não renderiza KAP/BSB diretamente como um TileLayer comum.
Uma forma prática é converter as cartas para tiles XYZ.

Instale GDAL e rode:

```bash
python 03_converter_kap_para_xyz.py
```

Resultado:

```text
public/cartas/<numero>/{z}/{x}/{y}.png
```

Há um exemplo React/Leaflet em `RasterMarinhaLayer.tsx`.

## Produção

Para um mapa profissional, o ideal é:

1. ler com GDAL os limites geográficos de cada KAP;
2. gerar `bounds.json`;
3. detectar a posição GPS;
4. escolher automaticamente a carta que cobre a posição;
5. conforme o zoom aumenta, preferir a carta de maior detalhe;
6. desenhar GPS, rota, AIS, largadas e waypoints por cima da carta.

## Atenção — direitos e uso comercial

A página oficial do CHM informa que as Cartas Raster disponibilizadas gratuitamente não podem ser
reproduzidas/compiladas/derivadas para fins comerciais sem autorização. Para adoção comercial,
a DHN orienta contato prévio e avaliação do uso, com participação da EMGEPRON.

Fonte oficial:
https://www.marinha.mil.br/chm/dados-do-segnav/cartas-raster

Também segundo o CHM, GeoTIFF é destinado a fins acadêmicos e não deve ser usado como auxílio à
navegação por não receber atualização regular. Este pacote, por isso, prioriza KAP/BSB.

## Segurança

Não trate um aplicativo próprio como substituto de equipamentos, publicações, procedimentos ou
cartas oficiais exigidos para navegação segura. Mantenha as cartas e Avisos aos Navegantes atualizados.

## Integração com PAINEL DE BORDO v58

Nesta versão, execute os comandos a partir da raiz do projeto:

```bash
npm run charts:download
npm run charts:extract
npm run charts:convert
```

O conversor foi ajustado para publicar os tiles diretamente em:

```text
public/cartas/<numero>/{z}/{x}/{y}.png
```

Ele também gera `public/cartas/installed.json` com os limites geográficos e a escala lidos do cabeçalho KAP. A página AIS usa esse arquivo para selecionar automaticamente a carta apropriada para a posição e para o nível de zoom.

Para produção na Vercel, grandes volumes de tiles devem preferencialmente ser hospedados em storage/CDN externo. Defina `NEXT_PUBLIC_DHN_TILE_BASE_URL` com a URL pública da pasta que contém as cartas; se a variável não existir, o app usa `/cartas`.
