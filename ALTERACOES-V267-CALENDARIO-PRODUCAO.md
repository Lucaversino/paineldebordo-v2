# V267 — Correção de quilos por dia no Calendário

- Corrige divergência entre o dia da largada mostrado no calendário e o dia do recolhimento que recebia o peso.
- A data operacional do peso agora é o dia de início da largada, inclusive se o recolhimento cruzar a meia-noite.
- Registros de captura sem largada continuam na data da própria captura.
- Adiciona aviso quando a soma diária das capturas não corresponde ao total da viagem no Dashboard, para evitar divergências silenciosas.
- Não altera datas, pesos ou registros existentes no banco.
