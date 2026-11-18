# Painel de Bordo V283 + NOAA GFS – Instalação

## Ordem de instalação

1. **Atualize o Render primeiro:** use o ZIP separado `timezero-render-NOAA-V283.zip` para atualizar o GitHub do serviço `timezero-grib-worker` existente. Não crie outro Render. Aguarde `/health` indicar `source: NOAA GFS 0.25` e `eccodes: true`.
2. **Atualize o GitHub do Painel de Bordo:** copie os arquivos do projeto V283 para a raiz do repositório ligado à Vercel. Isso atualiza `app/api/timezero-export/route.ts` e `components/PositionForecast.tsx`. Não altere Dashboard, Largadas, Capturas, AIS ou tabelas.
3. Na Vercel, confirme `TIMEZERO_WORKER_URL=https://timezero-grib-worker.onrender.com/api/timezero-jobs`, `TIMEZERO_WORKER_SECRET` igual ao Render, `NEXT_PUBLIC_SUPABASE_URL`, e `SUPABASE_SERVICE_ROLE_KEY` (ou `SUPABASE_SECRET_KEY`, disponível como alternativa na implementação). Nunca configure essas chaves com `NEXT_PUBLIC_`.
4. Supabase Storage: bucket privado `timezero-forecasts`, com acesso restrito pelo servidor e autenticação de usuário nas rotas Next.js.
5. Faça deploy no Render e depois Vercel. Teste com 30 MN / 24 horas, clique uma vez, acompanhe o progresso, baixe `.grb` e valide no ecCodes/TimeZero.

## Fonte e operações

- NOAA NOMADS: `https://nomads.ncep.noaa.gov/gribfilter.php?ds=gfs_0p25`.
- Filtro GRIB2: `https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl`.
- NOAA GFS Wave: `https://nomads.ncep.noaa.gov/cgi-bin/filter_gfswave.pl` (opcional, desligado por padrão).
- NOAA recomenda espaçar requisições do filtro em ~10 s. Portanto, 7 dias pode levar muitos minutos e consumir recursos.
- O novo worker usa fila em memória, evitando timeout HTTP da Vercel; a sessão do usuário e arquivos finalizados continuam no Supabase.

## Testes executados nesta entrega

- Python `compileall`: aprovado.
- `python -m unittest discover -s tests -v`: 7 testes aprovados (autenticação, health, URL GFS, grade, deduplicação, endpoint inexistente).
- **Não executados:** chamadas reais NOMADS (rede bloqueada no ambiente), decodificação binária ecCodes (biblioteca não instalada localmente), build Next completo (arquivo ZIP sem `package-lock.json` e ambiente npm externo indisponível), importação no TimeZero Professional.

## Critérios antes de usar no mar

Gerar GRIB1 NOAA verdadeiro, `grib_ls -p edition,shortName,level,dataDate,dataTime,stepRange` retornar campos coerentes, conferir visualmente grade, vento U/V e linha de tempo no TimeZero. Verificar NOAA Wave antes de ativar `NOAA_ENABLE_WAVES=true`. Não afirmar compatibilidade sem o teste real.
