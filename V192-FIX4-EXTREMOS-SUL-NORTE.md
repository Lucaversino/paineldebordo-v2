# V192 FIX 4 — EXTREMOS SUL/NORTE DA ÁREA TRABALHADA

Correção da lógica geográfica do relatório da viagem.

- O sistema **não usa mais a primeira e a última largada** para definir a área da viagem.
- Analisa **todas as posições iniciais e finais de todas as largadas** da viagem.
- Identifica o ponto de menor latitude como **EXTREMO SUL / posição mais ao Sul**.
- Identifica o ponto de maior latitude como **EXTREMO NORTE / posição mais ao Norte**.
- A longitude exibida é sempre a longitude pertencente ao próprio ponto extremo encontrado; latitude e longitude nunca são combinadas de largadas diferentes.
- O relatório individual mostra os dois pares completos de coordenadas e suas referências costeiras aproximadas.
- Exemplo operacional esperado: **Imbituba, SC → Cananéia, SP**.
- O PDF completo usa exatamente os mesmos extremos Sul/Norte calculados na tela.
- O relatório anual identifica a área Sul → Norte de cada viagem usando a mesma regra.
- O Tutorial/Ajuda foi atualizado para explicar a nova lógica.

A referência de cidade/estado é aproximada. As coordenadas exibidas continuam sendo as posições reais registradas nas largadas.
