# V244 — revisão restrita à clorofila

Base: paineldebordo-v2-V243-CAPTURAS-POR-VIAGEM(2).zip.
Revisão em 22/10/2026 (America/Sao_Paulo).

## Resultado: aprovada com ressalvas

Correções locais verificadas; recebimento completo em produção não confirmado. Não há garantia de ausência absoluta de erros nem de disponibilidade dos fornecedores. Esta entrega não foi publicada no site.

## Correções

- Ausência de clorofila não é mais convertida em 0 na previsão semanal, grade do mapa, tela, PDF da previsão e análise final.
- Célula Copernicus sem leitura permite usar o fallback NOAA, em vez de bloquear a alternativa com um zero artificial.
- Valores negativos, não finitos, vazios e acima de 1000 mg/m³ são rejeitados na normalização da previsão. Zero numérico explícito do modelo permanece válido.
- Consultas NOAA atuais descartam observações sem data válida, com mais de 10 dias ou mais de um dia no futuro. Essa janela é uma política operacional de validade, não uma garantia científica de atualização. A data continua exposta na tela.
- Histórico NOAA exige que a data retornada corresponda ao dia solicitado, evitando associar uma observação próxima a outra largada.
- Previsão Python preserva o eixo temporal quando existe apenas um dia: a leitura mantém sua data real em vez de ser atribuída ao dia de hoje.
- APIs Python de clorofila rejeitam coordenadas NaN/infinitas e fecham os datasets após a leitura bem-sucedida. Timestamps de satélite retornam UTC explícito.
- PDF da previsão identifica observação de satélite com data, inclusive quando a fonte é Copernicus.

## Verificações executadas

- `npm run typecheck`: passou, sem erros TypeScript.
- `next build`: passou, compilação de produção e geração de rotas concluídas.
- `node --experimental-strip-types --test tests/chlorophyll.test.mjs`: 2 testes passaram, com casos de ausência, zero explícito, leitura válida, grade, leitura antiga, data histórica divergente, CSV inválido, HTTP 503 e timeout.
- `python tests/test_chlorophyll.py`: 3 testes passaram; normalização, previsão com um único dia e satélite com célula central vazia. Requer numpy e xarray para reproduzir.
- Sintaxe das duas APIs Python: validada com py_compile.
- Testes de dados usam respostas controladas, não comprovam conexão autenticada com Copernicus.
- Ambiente local Node 24.19; projeto mantém sua exigência original Node 22.13–22.x. Não foram alteradas versões de dependências. A build no Node 22 do deploy ainda precisa ser confirmada.

## Verificação externa

- https://paineldebordo.vercel.app/: HTTP 200.
- Consulta pública a /api/position-forecast: sessão exigida; nenhum dado autenticado foi acessado.
- /api/copernicus-chlorophyll: HTTP 403 sem token interno; demonstra proteção do endpoint, não valida as credenciais nem os dados do fornecedor.
- NOAA `nesdisVHNnoaaSNPPnoaa20NRTchlaGapfilledDaily`: redirecionamento para endereço NOAA que retornou página de erro.
- NOAA `nesdisVHNnoaaSNPPnoaa20chlaGapfilledDaily`: HTTP 404 no teste.
- NOAA `nesdisVHNnoaa20chlaDaily` e `nesdisVHNchlaDaily`: CSV recebido, última data retornada 17/10/2026, mas valor NaN na posição -27.15, -48.30. NOAA-20 também retornou NaN entre 11 e 17/10 na posição -27.0, -47.5.
- Não foi possível determinar a causa das células vazias. Os resultados não provam indisponibilidade em toda a cobertura.
- Endereços dos fornecedores foram preservados: nenhum substituto foi incorporado sem comprovação de funcionamento.

## Próxima validação após publicar

Entrar no painel e consultar uma posição oceânica conhecida. Conferir a data e a fonte da clorofila atual, os sete dias, o mapa e o PDF. Confirmar no ambiente de deploy as duas variáveis COPERNICUSMARINE_SERVICE_USERNAME e COPERNICUSMARINE_SERVICE_PASSWORD, já exigidas pela V243. Se não houver dados, a ausência deve aparecer como “—”/sem leitura; nenhum valor é fabricado. Logs autenticados do deploy são necessários para investigar eventuais falhas de credenciais, inicialização ou timeout Copernicus.

## Preservação

Somente 8 arquivos existentes ligados à clorofila foram alterados, além de um utilitário novo, testes e este relatório. Capturas, viagens, largadas, navegação, login, banco, estilo global, dependências e configurações de publicação permanecem byte a byte iguais ao ZIP original. Não foram modificados registros salvos anteriormente nem corrigidos possíveis zeros históricos já gravados.

O ZIP não inclui node_modules, .next, caches ou credenciais novas. O script prebuild original remove a pasta tests no ambiente de build; rode os testes antes de npm run build. A numeração V244 identifica esta entrega; package.json foi preservado.
