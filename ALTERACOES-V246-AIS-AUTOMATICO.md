# V246 — barcos automáticos no mapa AIS

Base: V245 enviada pelo usuário. 23/10/2026.

## Comportamento
- Ao abrir AIS, consulta a região do centro do mapa, com filtro Pesca ativo.
- Seletor Pesca / Todos / Desligado. Pesca usa tipo informado pelo provedor (incluindo código 30) ou estado em pesca; não adivinha pelo nome.
- Nome acima do símbolo; MMSI quando não há nome. Nomes/símbolos sobrepostos são organizados pelo declutter existente: aproximar o mapa separa os barcos.
- Atualização nominal a cada 60 segundos após a resposta. Ao deslocar o mapa, aguarda a interação terminar e respeita intervalo mínimo de 15 segundos entre consultas. Consulta regional é limitada pelo endpoint existente, não equivale à cobertura global de MarineTraffic.
- Pausa requisições na aba oculta e cancela pedidos ao sair, trocar filtro ou mudar região. Respostas da região anterior são descartadas.
- Camada regional separada da busca manual, sem acumular regiões antigas e sem sobrepor marcadores de MMSI já pesquisados. Seleção mostra o cartão existente com origem e horário.
- Consultas automáticas usam /api/ais-map, sem créditos do painel e sem chamar AIS Premium. Planos/quota dos provedores externos continuam valendo.
- Coordenadas ausentes na API regional não viram zero. Horário ausente não é substituído pelo horário atual. Sinal antigo/desconhecido é indicado no resumo.
- Demais funcionalidades preservadas.

## Dependências reais de dados
A API existente tenta cache AISStream, VesselAPI, Kpler e Marinesia, conforme configuração e disponibilidade. Não foram acrescentadas credenciais nem feita publicação.
O package.json recebido menciona worker/aisstream-worker.mjs, mas esse arquivo não está no ZIP original. Se não houver coletor externo já ativo, o cache AISStream pode ficar vazio. É necessário um provedor regional funcional para os barcos aparecerem; a busca individual funcionar não garante que a consulta por região esteja disponível.
O endpoint limita a resposta (até 180 no cache; limites menores nos fallbacks). O filtro Pesca aplica-se aos barcos recebidos. Tipo desconhecido aparece em Todos, sem classificá-lo indevidamente como pesca. Kpler atualmente pode não devolver tipo; usar Todos quando necessário.

## Validação executada
- 7 testes aprovados: 3 de classificação/posição/horário e 4 da otimização V245.
- Transpilação dos arquivos modificados aprovada.
- Next.js 16.2.6: compilação de produção aprovada, executada diretamente sem o prebuild que remove testes.
- TypeScript: 34 diagnósticos na V245 e os mesmos 34 nesta versão, comparação textual idêntica. Nenhum novo diagnóstico. A configuração original ignora erros TypeScript na build; build aprovada não significa projeto sem erros.
- Ambiente de teste Node 24; requisito original Node 22 mantido.
- Não houve validação visual autenticada, teste de cobertura dos provedores ou medição de FPS em aparelhos reais.

Após publicar: abrir AIS sem pesquisar; testar Pesca/Todos, nomes e seleção, mover região, ocultar/retomar aba, desligar camada e conferir se a pesquisa manual continua funcionando. Se aparecer “Sem posições”, verificar o provedor regional/coletor no servidor.

Arquivos alterados: components/AISPage.tsx; app/api/ais-map/route.ts.
Adicionados: lib/aisAutomatic.ts; tests/ais-automatic.test.mjs; este relatório.
Reproduzir testes: node --experimental-strip-types --test tests/ais-automatic.test.mjs tests/ais-performance.test.mjs
