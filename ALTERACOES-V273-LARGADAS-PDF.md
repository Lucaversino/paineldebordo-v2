# V273 - Largadas e PDF das viagens finalizadas

- Botões **Baixar PDF atualizado** e **Compartilhar WhatsApp** no cabeçalho de cada pasta de viagem finalizada na aba Largadas.
- Botão **Editar nº** individual, sincronizado com o banco e refletido no próximo relatório PDF.
- Botão **Organizar numeração 1, 2, 3...** que ordena pela data e hora, com desempate pelo ID, preservando largadas e capturas. Renumeração em transação para respeitar o índice único existente.
- Alerta visual para largadas que têm a mesma data e as mesmas duas posições. Data repetida isoladamente continua permitida, pois várias largadas no mesmo dia são legítimas.
- Bloqueio de criação de novas largadas com a mesma data e mesmas duas posições; bloqueio também ao editar outra largada para coincidir com as mesmas posições e data.
- Edição de captura já existente no projeto V272 permanece acessível nas pastas finalizadas. O PDF busca os dados atuais do banco após salvar as alterações.

**Importante:** Não houve alteração nem exclusão automática das duas largadas antigas de 31/10/2026, pois possuem capturas diferentes (1150 kg e 1050 kg) e é necessário identificar qual dado está incorreto. A pasta agora sinaliza a duplicidade para revisão manual.

**Validação:** Não foi possível executar compilação completa, pois o ZIP original não contém node_modules nem lockfile de dependências. Testar build no ambiente com dependências instaladas antes de publicar.
