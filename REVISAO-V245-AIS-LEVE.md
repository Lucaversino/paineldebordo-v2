# V245 — mapa AIS mais leve

Base: V244 — revisão da clorofila. Data: 23/10/2026.

## Alterações restritas ao mapa AIS

- Resolução interna do canvas limitada a 1,5 em dispositivos com ponteiro de toque e a 2 no desktop. Telas de menor densidade mantêm sua resolução. Isso reduz pixels a processar em telas de alta densidade, com possível pequena redução de nitidez. Não altera coordenadas, zoom ou dados.
- Pontos oficiais deixam de recriar ícones e textos a cada deslocamento. Seus estilos mudam somente nos limiares reais de zoom (8, 9 e 11), preservando tamanhos e nomes existentes.
- Respostas idênticas de pontos e áreas oficiais reutilizam o estado existente, evitando limpar e reconstruir suas camadas a cada atualização. Edições, inclusões, exclusões e alterações de visibilidade continuam aplicadas. Frequência de consulta preservada.
- Pontos pessoais, pontos oficiais e áreas oficiais são inseridos em lote no OpenLayers, preservando polígonos, vértices, coordenadas, nomes e estilos.
- Seleção por clique/toque pesquisa apenas a camada correspondente: embarcações, pontos oficiais, pontos pessoais ou rota. Tolerâncias e prioridade de seleção preservadas; batimetria e camadas não interativas deixam de participar dessas buscas.
- Alterar a transparência da carta DHN não recria mais sua fonte de imagens. Troca de carta e seleção automática continuam funcionando como antes.
- Recursos internos do mapa são descartados ao sair da tela.
- Correção de tipagem da lista de números no parser do catálogo DHN, sem mudança de comportamento.

Não foram alterados fornecedores AIS, créditos, autenticação, frequência de busca AIS, validade dos barcos, filtros, dados armazenados, navegação GPS, rotas, cálculos de distância, clorofila ou APIs. Nenhuma camada náutica ou embarcação foi removida para ganhar desempenho.

## Validação

- Quatro testes automatizados passaram: resolução, equivalência dos limiares visuais, preservação de mudanças de dados e inserção em lote de 2.000 marcações.
- No teste sintético OpenLayers, 2.000 geometrias e metadados foram preservados; notificações de alteração da fonte na inserção caíram de 2.000 para 1. Isso não representa medição de FPS nem aceleração equivalente no aparelho real.
- Comparação TypeScript sem cache: V244 com 35 diagnósticos; V245 com 34, nenhum diagnóstico novo. O erro de tipagem do AIS foi corrigido. Os demais ficam em partes fora deste pedido.
- IMPORTANTE: retificação do relatório V244 — a afirmação anterior de TypeScript sem erros estava incorreta. A configuração original usa ignoreBuildErrors=true; build aprovada não comprova typecheck global aprovado. Configuração preservada.
- Compilação de produção Next.js: concluída com sucesso. Validação local executada em Node 24; a configuração original de Node 22 do projeto foi preservada.
- Sem teste visual automatizado: o navegador de testes não pôde ser instalado neste ambiente. Não houve medição de FPS no PC ou celular do usuário nem validação autenticada dos fornecedores AIS.

## Após publicar

Conferir no PC e no celular: arrastar e ampliar mapa, tocar em embarcações e pontos oficiais, selecionar/editar rota, usar régua, alternar mapa/carta e ajustar transparência. Comparar a fluidez no mesmo aparelho, região e quantidade de barcos. Se persistir lentidão, medir os tempos de rede das cartas/batimetria e o custo de desenho no aparelho real antes de alterar outras funções.

O ZIP preserva os arquivos da V244, com alteração apenas em components/AISPage.tsx e adição do utilitário lib/aisMapPerformance.ts, teste tests/ais-performance.test.mjs e deste relatório. Sem node_modules ou caches. Não publicado automaticamente.

Reproduzir os testes: node --experimental-strip-types --test tests/ais-performance.test.mjs (após instalar as dependências). O prebuild original remove tests; executar antes da build.
