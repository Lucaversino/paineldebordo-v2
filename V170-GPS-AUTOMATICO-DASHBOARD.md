# V170 — GPS automático no Dashboard

- Ao entrar no Dashboard, solicita localização com `getCurrentPosition()`.
- Em seguida mantém a posição atualizada com `watchPosition()` e alta precisão.
- Ao sair do Dashboard, encerra o watcher com `clearWatch()`.
- Mantém latitude, longitude, horário, heading e velocidade da última posição no dispositivo.
- Ao abrir o AIS, o MEU BARCO usa imediatamente essa última posição, preservando o ícone atual.
- Não adiciona OpenAI, API externa nem consumo de créditos.
- AIS, Premium, pagamentos, créditos, rotas e layout permanecem inalterados.
