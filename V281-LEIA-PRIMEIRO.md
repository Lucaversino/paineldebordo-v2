# V281 - Correção do caminho da exportação TimeZero

## O que foi identificado
Na captura de 18/11 o navegador estava executando uma versão antiga, que ainda chamava `/api/timezero-grib` e recebia HTTP 401. O arquivo de código V280 anexado chama `/api/timezero-export`, portanto o deploy exibido não correspondia ao frontend do ZIP.

## Alterações da V281
- `components/PositionForecast.tsx`: chama `/api/timezero-export`, envia sessão Supabase por Bearer e faz uma tentativa de renovação apenas após HTTP 401.
- `app/api/timezero-export/route.ts`: autentica cookie **ou** Bearer por `getPanelUserFromRequest`, usa a URL configurada do Render sem fallback local e registra erros sem dados sensíveis.
- `app/api/timezero-grib/route.ts`: rota de compatibilidade que delega à nova rota segura.
- `api/timezero-grib.py`: removida a função legada Python Vercel, para não conflitar com o worker Render.
- `vercel.json`: removida configuração de implantação da função Python legada.

## Publicação
1. Extraia o ZIP e envie a pasta **gribwork** como raiz do mesmo repositório Git usado pela Vercel (substitua o código da V280, preservando suas variáveis e o banco).
2. Confira `TIMEZERO_WORKER_URL=https://timezero-grib-worker.onrender.com/api/timezero-grib`.
3. Confira `TIMEZERO_WORKER_SECRET` (mesma senha no Render), `SUPABASE_SERVICE_ROLE_KEY` e `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. O bucket privado `timezero-forecasts` deve existir no Supabase Storage.
5. Faça novo deploy e teste em janela anônima após login. No F12 > Network, o novo frontend deve chamar `/api/timezero-export`, nunca a rota Python antiga.
6. Teste inicialmente 30 MN e 24h, sem clicar repetidamente.

## Limitações
Os testes estruturais de rota não comprovam que a Open-Meteo devolveu dados, que o worker codificou um GRIB válido nem que o TimeZero v4/v5 abriu o arquivo. É obrigatório executar teste integrado de geração e validação no software antes de utilizar em navegação.
