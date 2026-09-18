# Cartas Náuticas da Marinha — v65

A v65 usa duas formas de carregar as cartas da DHN/CHM:

1. **Oficial online (padrão):** o painel consulta o WMS público do GeoServer IDEM-DHN (`https://idem.dhn.mar.mil.br/geoserver/wms`). Não é necessário converter KAP para o mapa funcionar.
2. **Tiles locais (opcional/offline):** se existirem cartas convertidas em `public/cartas/<numero>/{z}/{x}/{y}.png`, o painel pode usá-las localmente.

## Por que o modo online foi adotado

O pacote `cartas_marinha_RS_SC_SP_RJ_setup.zip` contém o catálogo e os scripts, mas não contém os arquivos `.KAP`/`.BSB` binários das cartas. Sem esses arquivos não existe imagem para converter localmente. Além disso, dezenas de cartas convertidas em XYZ podem ocupar centenas de MB ou vários GB, o que não é uma boa solução para um deploy normal da Vercel.

Na v65, `/api/dhn/charts` lê o GetCapabilities do GeoServer oficial e identifica as camadas das cartas selecionadas de RJ, SP, PR, SC e RS. Quando uma carta possui vários painéis, as camadas são combinadas automaticamente.

## Conversão local opcional

Se quiser manter cópia offline, rode em uma máquina com internet e GDAL:

```bash
npm run charts:download
npm run charts:extract
npm run charts:convert
```

Os scripts permanecem em `tools/cartas-marinha`.

## Uso

No AIS agora existem somente dois botões de base:

- **Marinha** — carta oficial IDEM-DHN, quando disponível.
- **Mapa** — OpenStreetMap.

O modo **Oceano** foi removido.

## Aviso

As cartas raster da DHN são auxílio à navegação. Consulte as regras de uso do CHM/DHN e mantenha cartas/avisos oficiais atualizados. Para uso comercial das cartas, verifique a autorização aplicável junto à DHN/EMGEPRON.
