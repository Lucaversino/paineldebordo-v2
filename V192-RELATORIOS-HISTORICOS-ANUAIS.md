# V192 — RELATÓRIOS HISTÓRICOS E ANUAIS

Base: V191 — Descarte Vivo/Morto.

## Implementado

- Comparar viagens organizado em pastas por ano (2026, 2027, ...).
- Somente viagens finalizadas entram nas pastas anuais e no consolidado anual.
- Botão **Abrir relatório completo** em cada viagem finalizada.
- Relatório completo com dados da viagem, capturas, espécies, descarte Vivo/Morto, largadas, posições, área geográfica trabalhada e meteorologia histórica salva.
- Área trabalhada calculada pelas coordenadas das largadas, com limites Norte/Sul/Leste/Oeste e identificação aproximada da costa quando possível.
- PDF completo da viagem ganhou página de região trabalhada e descarte Vivo/Morto.
- Compartilhamento do PDF completo usa Web Share API quando disponível; mantém fallback de download.
- Relatório anual por ano com viagens, dias, largadas, total capturado, médias, espécies, descarte Vivo/Morto, região trabalhada e resumo meteorológico.
- PDF anual com as mesmas consolidações.
- Tutorial/Ajuda atualizado para pastas por ano, relatório completo, relatório anual, PDF anual e descarte Vivo/Morto.
- `netLengthMeters` incluído no retorno operacional para aparecer nos detalhes das largadas do relatório completo.

## Regra de meteorologia histórica

Os relatórios consultam `/api/environmental-snapshots` para ler os registros já armazenados. A geração histórica não força nova consulta de previsão para reconstruir condições antigas.

## Regra geográfica

A região é calculada usando as posições inicial e final das largadas. O nome da costa é apenas uma aproximação por faixa de latitude e o relatório sempre mostra também as coordenadas extremas, evitando inventar uma cidade/local exato.

## Segurança de dados

- Cada viagem continua isolada por `tripId`.
- O consolidado anual apenas soma viagens finalizadas do mesmo ano.
- V191 Vivo/Morto continua preservado na edição e agora também aparece nos novos relatórios.
