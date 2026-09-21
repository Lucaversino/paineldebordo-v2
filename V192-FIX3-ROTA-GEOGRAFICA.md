# V192 FIX 3 — ROTA GEOGRÁFICA DA VIAGEM

Correção do relatório geográfico para leitura operacional da viagem.

- O relatório individual não usa mais os extremos Latitude Sul/Norte e Longitude Oeste/Leste como informação principal.
- Agora o trajeto é mostrado na ordem cronológica das largadas: **primeira posição registrada → última posição registrada**.
- As duas posições aparecem como pares completos `latitude / longitude`, evitando confusão entre coordenadas soltas.
- O painel calcula uma referência costeira aproximada para cada ponta da viagem (ex.: **Imbituba, SC → Cananéia, SP**).
- O PDF completo usa exatamente a mesma rota e as mesmas posições exibidas na tela.
- O relatório anual mantém a área consolidada do ano e passa a mostrar a rota individual de cada viagem.
- O Tutorial/Ajuda foi atualizado para explicar essa nova leitura.

A classificação geográfica é uma referência operacional aproximada baseada nas coordenadas salvas; os pontos reais continuam sendo as coordenadas registradas nas largadas.
