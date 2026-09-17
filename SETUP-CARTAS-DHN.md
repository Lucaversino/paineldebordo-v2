# PAINEL DE BORDO v58 — Cartas Raster DHN/CHM

A v58 integra ao mapa AIS o catálogo de Cartas Raster KAP/BSB da Marinha do Brasil (DHN/CHM) para RS, SC, SP, RJ e transição pelo PR.

## Importante sobre o pacote recebido

O arquivo `cartas_marinha_RS_SC_SP_RJ_setup.zip` contém o **catálogo e os scripts de download/conversão**, mas não contém os arquivos `.KAP` nem os tiles prontos. Por isso a v58 inclui toda a integração, mas é necessário preparar os tiles uma vez antes de eles aparecerem no mapa.

## Preparar as cartas

Na raiz do projeto:

```bash
npm run charts:download
npm run charts:extract
npm run charts:convert
```

- `charts:download`: busca da página oficial do CHM as versões atuais das cartas listadas.
- `charts:extract`: extrai os arquivos NOAA-BSB/KAP.
- `charts:convert`: usa GDAL/gdal2tiles para gerar tiles XYZ web e também `public/cartas/installed.json`.

### Dependência para conversão

Instale GDAL no computador que fará a conversão.

- Windows: OSGeo4W
- macOS: `brew install gdal`
- Ubuntu/Debian: `sudo apt install gdal-bin python3-gdal`

## Como a seleção funciona

O conversor lê do cabeçalho KAP:

- número da carta;
- título;
- escala;
- referências geográficas.

A página AIS usa esses dados para escolher automaticamente uma carta que cubra a posição central do mapa. Conforme o zoom, ela procura a escala mais apropriada. Também é possível desligar o modo automático e escolher uma carta manualmente.

## Vercel e armazenamento

Poucas cartas podem ser publicadas dentro de `public/cartas`. Para o conjunto completo, o número de tiles pode ficar grande demais para um deploy simples na Vercel. Nesse caso, hospede as pastas de tiles em um storage/CDN público e configure:

```text
NEXT_PUBLIC_DHN_TILE_BASE_URL=https://seu-cdn.exemplo/cartas
```

Mantenha `public/cartas/installed.json` no projeto para que o painel saiba quais cartas existem e seus limites.

## Uso e direitos

Consulte sempre as condições vigentes no portal do CHM/DHN. O próprio CHM informa que a Carta Raster KAP/BSB é atualizada conforme Avisos aos Navegantes permanentes, mas seu uso em software não dispensa as cartas e procedimentos oficiais aplicáveis. Para reprodução/compilação/derivação com finalidade comercial, o CHM informa que é necessária autorização/acordo apropriado.
