# V193 FIX — Extremos Sul/Norte no relatório de viagem

Correção aplicada sobre a V193 mantendo a Inteligência da Pesca.

## Regra restaurada da comparação de viagens

- NÃO usa a primeira largada como origem geográfica.
- NÃO usa a última largada como destino geográfico.
- Analisa as posições **inicial e final de TODAS as largadas** da viagem.
- Encontra o ponto realmente **mais ao Sul**.
- Encontra o ponto realmente **mais ao Norte**.
- A longitude mostrada é sempre a longitude do MESMO ponto extremo encontrado.
- Não mistura latitude de uma largada com longitude de outra.

## Exibição

O relatório passa a mostrar na ordem:

- **A VIAGEM FOI DE: região Sul ATÉ região Norte**
- **PONTO MAIS AO SUL:** latitude / longitude
- **PONTO MAIS AO NORTE:** latitude / longitude

Exemplo esperado quando os dados da viagem produzirem esses extremos:

- Mais ao Sul: `27°4710 S / 48°2243 W` — Imbituba, SC
- Mais ao Norte: `25°1133 S / 47°2340 W` — Cananéia, SP
- **A VIAGEM FOI DE: Imbituba, SC ATÉ Cananéia, SP**

A mesma lógica foi sincronizada com relatório completo na tela, PDF da viagem, relatório anual, PDF anual e Ajuda/Tutorial.
