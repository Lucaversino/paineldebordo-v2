# V188 — V186 com Central de Ajuda

Base integral: paineldebordo-v2-V186-POSICAO-GPS-SINCRONIZADA(3).zip enviado pelo usuário.
Substitui a entrega V187 baseada na V185. Inclui a base V186, não é apenas um patch.

## Preservado da V186
- Formatação de posição 25°4719 / 48°0296, zeros e edição dos campos.
- Biblioteca marineCoordinate e componente CoordinateInput idênticos ao ZIP V186.
- Atalho MINHA LOCALIZAÇÃO ATUAL e consulta automática ao abrir Ventos e Mar.
- Integração e lógica de posição do mapa ambiental, AIS e demais módulos da base.

## Adicionado
- Aba Ajuda e botão pequeno no Dashboard.
- 23 tutoriais com busca, categorias, quatro passos por assunto e navegação para a ferramenta.
- Ilustração de pescaria, sete diagramas didáticos locais e leitura em voz alta quando disponível no navegador.
- Tutorial GPS adaptado ao padrão da V186.
- Explicação de clorofila por satélite versus previsão, datas e limites de interpretação.
- Nova identificação do cache da aplicação.

## Verificações realizadas
- Comparação de todos os arquivos com a V186: somente app/page.tsx, app/globals.css, components/PositionForecast.tsx e public/sw.js receberam alterações, além dos novos arquivos de Ajuda.
- Removendo as adições de Ajuda, app/page.tsx é exatamente igual ao arquivo da V186.
- PositionForecast preserva a lógica V186; única alteração é o parágrafo explicativo da clorofila.
- TypeScript dos módulos Ajuda e coordenadas: passou.
- Renderização React da Ajuda, 23 tutoriais, IDs, quatro passos, destinos e imagens: passou.
- Nove verificações de coordenadas: formatação, campo vazio, entrada parcial, zeros, conversão de ida e volta e rejeição de minutos inválidos: passaram.

## Limites de validação
Build integral e teste visual/interativo em navegador não concluídos neste ambiente, conforme limitações já registradas na entrega anterior. GPS físico e consultas de APIs não testados ao vivo. Não houve publicação nem alteração de banco de dados.
Para publicar, instale as dependências do projeto e execute npm run build no ambiente configurado; confira o acesso à Ajuda e o GPS no aparelho.
