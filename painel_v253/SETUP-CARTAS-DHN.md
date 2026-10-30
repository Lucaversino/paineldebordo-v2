# Cartas Náuticas DHN — V194

A carta náutica agora é **automática no AIS**. Ao entrar no mapa, o sistema escolhe a carta que cobre a posição e troca para uma carta de maior detalhe conforme o zoom aumenta. Não é necessário apertar botão de cartas.

## Ordem de carregamento

1. **Tiles locais**, se existirem em `public/cartas/<numero>/{z}/{x}/{y}.png`.
2. **WMS oficial IDEM-DHN**, quando não houver tile local, usando `/api/dhn-map` como proxy interno para evitar CORS.
3. **Mapa base OSM** continua embaixo e serve de fallback se a DHN estiver temporariamente indisponível.

## Pacote de cartas enviado

O arquivo `cartas_marinha_RS_SC_SP_RJ_setup` contém catálogo e scripts, mas não contém os binários `.KAP/.BSB`. Por isso a V194 funciona online sem depender da conversão local.

Para preparar uma cópia local/offline em uma máquina com internet e GDAL:

```bash
npm run charts:download
npm run charts:extract
npm run charts:convert
```

Depois do `charts:convert`, o AIS detecta automaticamente `public/cartas/installed.json` e prioriza as cartas locais.

## Área

A estrutura contempla RJ, SP, PR, SC e RS, incluindo as cartas costeiras 23100, 23200, 23300, 23400, 23500 e 23600 e cartas locais de maior detalhe quando disponíveis no serviço.
