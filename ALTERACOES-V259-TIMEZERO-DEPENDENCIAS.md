# V259 — Correção de dependências do exportador TimeZero

A V258 apresentava `Conversor GRIB1 indisponível` porque a função Python não conseguia importar ecCodes no ambiente publicado.

- Dependências de produção declaradas explicitamente: `eccodes==2.50.0` e `eccodeslib==2.50.0.33` (biblioteca nativa).
- Endpoint `api/timezero-grib.py` adicionado às funções configuradas do Vercel com duração máxima de 60 s.
- Falha de importação informa detalhes suficientes para diagnóstico.

**Atenção:** não houve acesso a um deploy Vercel, aos dados da Open-Meteo nem ao TimeZero local nesta sessão. Não há confirmação de GRIB importável. Publique em Preview primeiro, teste `GET /api/timezero-grib?lat=-31.7&lon=-50.9&radius=30&hours=24`, confirme HTTP 200, depois abra o GRIB no TimeZero e confira a direção/velocidade do vento e a pressão. Não use para navegação antes da validação.
