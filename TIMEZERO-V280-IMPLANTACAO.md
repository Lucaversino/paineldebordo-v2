# TimeZero V280: implantação e limitações

## Variáveis de ambiente (somente servidor)

- `TIMEZERO_WORKER_SECRET`: segredo aleatório forte, igual na rota Next e no worker Python.
- `SUPABASE_SERVICE_ROLE_KEY`: chave de serviço do Supabase para armazenamento privado (NUNCA `NEXT_PUBLIC_`).
- `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto Supabase (já usada pelo painel).
- `TIMEZERO_WORKER_URL` (opcional): URL HTTPS do worker Python, terminando no endpoint do gerador, caso esteja fora da Vercel. Sem ela, Next chama `/api/timezero-grib` no mesmo domínio.

Crie no Supabase Storage um bucket **privado** chamado `timezero-forecasts`, sem acesso público. O servidor utiliza a service role e armazena em `<id_da_conta>/<hash_da_consulta>.<formato>`. Cada conta possui caminho próprio. Não use bucket público.

A instalação Python precisa ter `eccodes` e biblioteca nativa do ecCodes funcionais. Se a Vercel falhar ao incluir as bibliotecas nativas, implante o Python em contêiner com ecCodes, em serviço separado, usando TLS e `TIMEZERO_WORKER_SECRET`, e configure `TIMEZERO_WORKER_URL` no Next.js.

## Limitações operacionais

- Cache persistente por conta e data UTC via Supabase Storage. O cache de API Open-Meteo dentro do worker é apenas em memória, não coordenado entre múltiplas instâncias. Há deduplicação e intervalo de 15 segundos **por instância Next**, não há limite global distribuído. Para alta escala, instalar limitador/fila compartilhados.
- Históricos antigos do painel não foram alterados. O cache persiste os downloads gerados; ainda não existe interface para listar e excluir separadamente esses arquivos GRIB armazenados.
- A fonte Marine pode ser indisponível em algumas posições. O arquivo segue com vento quando isso ocorrer. A resolução usada é grade 5×5 e não deve ser confundida com resolução nativa dos modelos.
- O arquivo de referência informa formato e parâmetros, mas **não prova** que uma saída recém-gerada será reconhecida pelo TimeZero v4/v5; exige teste no aplicativo real.
- A classificação do parâmetro 100 segue a tabela GRIB1 NCEP/WMO e o arquivo de referência. Outros parâmetros proprietários/não confirmados não são exportados.
- A ausência de instalação ecCodes neste ambiente impediu validação GRIB1 com decodificador externo; testes locais verificaram apenas estrutura do arquivo de referência e lógica auxiliar.
- Para qualquer uso comercial das APIs Open-Meteo, verificar contrato/plano apropriado e atribuição das fontes antes do lançamento em produção.

## Validação final antes de utilizar em navegação

1. Instalar ecCodes e rodar testes: `python -m unittest discover -s tests -p test_timezero_grib.py -v`.
2. Gerar `.grb` e `.grbzip` com dados atuais num ambiente com internet e credenciais.
3. Executar `grib_ls -p edition,shortName,typeOfLevel,level,dataDate,dataTime,stepRange,Ni,Nj arquivo.grb` e `grib_count arquivo.grb`.
4. Abrir arquivo `.grb` no TimeZero Professional v4 e v5 em estação autorizada, confirmar vento U/V, ondas e avanço temporal, comparar com a origem. Só então liberar para uso operacional.
