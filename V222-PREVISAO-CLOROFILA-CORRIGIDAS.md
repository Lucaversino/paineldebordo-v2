# V222 — Previsão + Clorofila corrigidas

Correções desta versão:

- Previsão de vento/mar não fica mais bloqueada esperando a clorofila.
- Corrigida a ordem da latitude na consulta de área do NOAA ERDDAP (eixo VIIRS N→S).
- Fallbacks NOAA agora são consultados em paralelo, com orçamento curto de tempo.
- Copernicus semanal passou a ter timeout curto para não segurar a resposta principal.
- Timeout da tela foi ampliado de 15s para 22s como margem de segurança.
- Ocean Intelligence e histórico ambiental usam o mesmo mecanismo de clorofila sem fallback sequencial lento.
- Cache PWA atualizado para forçar a entrada da correção em instalações já existentes.

Preservados: AIS, navegação, créditos, mapas, waypoints, viagens, largadas, capturas, PDFs, login e onboarding.
