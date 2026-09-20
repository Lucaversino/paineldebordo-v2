# V172 — Clorofila semanal direto do Copernicus Marine

A V172 remove a dependência da Amentum para a previsão de clorofila e consulta diretamente o serviço oficial gratuito do Copernicus Marine.

## Produto usado

- Produto: `GLOBAL_ANALYSISFORECAST_BGC_001_028`
- Dataset diário: `cmems_mod_glo_bgc-pft_anfc_0.25deg_P1D-m`
- Variável: `chl`
- Unidade: `mg m-3`
- Profundidade: superfície (primeiro nível, aproximadamente 0,49 m)
- Horizonte do produto: até 10 dias; o painel mostra 7 dias.

## Configuração na Vercel

Crie gratuitamente uma conta no Copernicus Marine e adicione estas duas variáveis de ambiente na Vercel:

- `COPERNICUSMARINE_SERVICE_USERNAME`
- `COPERNICUSMARINE_SERVICE_PASSWORD`

Não coloque usuário ou senha no código e não use prefixo `NEXT_PUBLIC_`.

Depois faça um novo deploy.

## Como funciona

1. O usuário consulta uma posição em **Ventos e Mar**.
2. A rota autenticada `/api/position-forecast` chama internamente `/api/copernicus-chlorophyll`.
3. A função Python usa o pacote oficial `copernicusmarine` para abrir somente o ponto, a superfície, a variável `chl` e os próximos 7 dias.
4. Os cards semanais recebem a clorofila em mg/m³.
5. A clorofila atual do card principal continua sendo a observação VIIRS já existente.

A função Python é protegida por um token interno calculado a partir das próprias credenciais do Copernicus, evitando deixar o endpoint de consulta aberto para uso externo.

## Arquivos adicionados

- `api/copernicus-chlorophyll.py`
- `requirements.txt`
- `.python-version`
- `vercel.json`

## Arquivos alterados

- `app/api/position-forecast/route.ts`
- `components/PositionForecast.tsx`
- `public/sw.js`

Nenhum layout, AIS, GPS, rota, crédito ou pagamento foi alterado.
