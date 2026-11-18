# V282 – correção de build para Next.js 16

Erro corrigido: `Next.js can't recognize the exported dynamic/runtime field in route. It mustn't be reexported.`

Arquivo alterado: `app/api/timezero-grib/route.ts`

Configurações `runtime`, `dynamic` e `maxDuration` agora são declarações literais nesta própria rota; somente o handler GET é reutilizado da rota `app/api/timezero-export/route.ts`.

Não foi alterado o worker Render nem a lógica de previsão.

## Publicação

Copie o conteúdo da pasta `gribwork/` para a raiz do repositório do Painel de Bordo, preservando os demais arquivos do repositório. Confirme que `app/api/timezero-grib/route.ts` foi substituído. Faça commit/push e execute o deploy no Vercel.

## Validação

A estrutura e o trecho defeituoso foram conferidos estaticamente. O build completo não foi executado neste ambiente (o arquivo ZIP fornecido não inclui `package-lock.json` nem `node_modules`). O deploy na Vercel é necessário para confirmar. Mesmo após um build bem sucedido, testar autenticação, download GRIB e importação no TimeZero.
