# V186 — Posição GPS padronizada e previsão rápida

- Padroniza campos de coordenadas do painel em `DD°MMMM` (ex.: `25°4719` / `48°0296`).
- GPS do celular passa a preencher exatamente no mesmo formato visual usado na digitação manual.
- Campos continuam totalmente editáveis: podem ser apagados e digitados novamente.
- Mantém conversão interna para decimal apenas no momento de consultar APIs/mapas.
- Ventos e Mar e Mapa Ambiental usam a mesma latitude/longitude da consulta.
- Ao capturar GPS em Ventos e Mar, a posição também é sincronizada com a análise oceânica do Dashboard.
- Novo atalho `MINHA LOCALIZAÇÃO ATUAL` no Dashboard: abre Ventos e Mar, captura o GPS e consulta automaticamente a previsão/mapa ambiental.
- Nova Largada, edição de largada, análise oceânica e posição manual do AIS adotam o mesmo padrão visual.

Compatibilidade: parser do backend continua aceitando o grau no valor (`25°4719`) e a camada offline remove caracteres de formatação antes de converter.
