# V233 — Variação magnética WMM2025

- Utiliza coeficientes WMM2025 NOAA/BGS (época 2025, válidos até 2029) integrados à aplicação para cálculo offline.
- Mostra rumo verdadeiro, declinação magnética local e rumo magnético equivalente para comparação com a interface do TimeZero.
- Data do modelo selecionável (2025–2029), por padrão a data atual em UTC.
- A declinação é calculada na posição média aproximada das duas pontas, ao nível do mar (0 km).
- Geração das pontas e afastamentos permanece baseada no rumo verdadeiro, não no rumo magnético.
- PDF geral inclui rumo verdadeiro, magnético, declinação e data/modelo.
- Cálculo matemático: Rumo magnético = (rumo verdadeiro - declinação + 360) % 360, considerando declinação positiva para leste e negativa para oeste.

## Comparação com TimeZero em 21/10/2026

Para a região aproximada 31,98°S / 50,91°W, declinação WMM2025 estimada em 16,99° oeste.
Rumo verdadeiro de cerca de 33,22° corresponde a rumo magnético de aproximadamente 50,21° M.
A imagem do TimeZero apresenta 50,6° M no trecho, diferença de aproximadamente 0,4° a verificar quanto a referência, direção/posição exata da linha, projeção e configurações do equipamento.

**Atenção**: as rotas e coordenadas ainda precisam ser conferidas na carta náutica e nos equipamentos, especialmente antes de distribuir posições operacionais a outras embarcações.
