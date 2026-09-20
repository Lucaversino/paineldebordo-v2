# V166 — AISStream principal

Alteração isolada do AIS FREE, sem mudanças de layout.

- AISStream (worker Railway -> `ais_live_vessels`) é a fonte principal de `/api/ais-map`.
- Fallbacks FREE, nesta ordem: VesselAPI Free -> Kpler Maritime -> Marinesia AIS.
- A busca FREE por área chama `/api/ais-map` diretamente, evitando a chamada antiga à Marinesia antes do AISStream.
- A atualização automática do mapa usa somente `/api/ais-map`; não dispara Marinesia em paralelo.
- Premium, créditos, barcos salvos, GPS, navegação, waypoints e CSS/layout não foram alterados.
- Cache PWA identificado como `painel-bordo-v166-aisstream-primary`.

Observação de validação: o ZIP recebido não continha `package-lock.json` nem dependências instaladas utilizáveis no ambiente de empacotamento, então o typecheck completo não pôde ser concluído aqui. A alteração foi mantida restrita aos fluxos acima.
