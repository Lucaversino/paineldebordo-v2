# V284 - PDF personalizado por largadas

- Nova ação **PDF personalizado** em Viagem atual, pastas das largadas (inclusive viagens finalizadas), Histórico e Relatórios.
- No formulário, marque individualmente as largadas desejadas ou utilize Todas/Limpar.
- Datas e horários de saída e de chegada ao porto são editáveis para esse PDF específico. **Não são gravados na viagem.** A chegada é opcional no PDF personalizado para embarcações ainda em viagem.
- Totais de Corvina, Mistura e Descarte, resumo de espécies, posições geográficas, largadas e calendário são gerados sobre o subconjunto selecionado.
- Somente capturas vinculadas a uma largada selecionada compõem o PDF parcial. Capturas soltas ficam de fora, evitando totais inflados.
- Calendário e anotações são carregados da conta e limitados às datas informadas no relatório. As largadas exibidas no diário são apenas as selecionadas.
- O cabeçalho identifica expressamente **RELATÓRIO PARCIAL DE VIAGEM** e o nome do arquivo começa com `Relatorio-Parcial-`.
- O PDF completo continua com seu fluxo original e com gravação de datas, quando usada essa opção.

## Verificação

Arquivos TSX/TS alterados verificados com o parser/transpilador TypeScript, sem erros de sintaxe. Não foi possível executar `npm run typecheck` ou `npm run build` porque a instalação das dependências falhou neste ambiente. Recomenda-se testar o fluxo de exportação no deployment antes de liberar para a tripulação.
