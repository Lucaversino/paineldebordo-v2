# Status das Cartas da Marinha — v65

A interface não exibe mais “cartas ainda não convertidas” como caminho principal.

## Modo principal

O botão **Marinha** usa o WMS público do GeoServer IDEM-DHN e descobre as camadas oficiais em `/api/dhn/charts`.

## Conversão KAP local

O pacote de setup fornecido traz catálogo e scripts de download/extração/conversão. A v65 mantém esses scripts em `tools/cartas-marinha` como opção para cópia local/offline.

Para gerar tiles locais numa máquina com acesso ao CHM e GDAL:

```bash
npm run charts:download
npm run charts:extract
npm run charts:convert
```

O mapa online não depende desses comandos.
