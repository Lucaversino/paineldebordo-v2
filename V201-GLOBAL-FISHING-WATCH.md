# V201 — Global Fishing Watch no FREE

## Ativação
1. Na hospedagem do Painel de Bordo, abra as variáveis de ambiente do projeto.
2. Adicione `GFW_API_TOKEN` com o token gerado no Global Fishing Watch. Não use prefixo NEXT_PUBLIC e não coloque o token no código ou GitHub.
3. Publique esta versão novamente para carregar a variável.
4. Entre no painel, abra AIS e pesquise um barco conhecido na primeira aba FREE.

O token da imagem está oculto; ele não foi inserido neste pacote. Nenhuma chave existente precisa ser substituída. Não é necessária migração do banco.

## Uso
- Global Fishing Watch é a primeira aba da pesquisa FREE.
- Pesquise nome, MMSI, IMO ou indicativo com ao menos 3 caracteres.
- Veja identidade, bandeira, indicativo e período do registro. Carregue mais resultados quando disponível.
- A API de identidade não fornece coordenadas atuais. Nenhum marcador é criado a partir desses registros.
- Consultar posição usa as fontes FREE já configuradas (APRS.fi ou ShipFinder); depende de cobertura e configuração. Não aciona PREMIUM.
- Outras fontes mantém a pesquisa FREE anterior. Fechar resultados libera a visualização do mapa.
- As consultas GFW não descontam créditos do painel e acontecem apenas por ação do usuário.

## Preservação
Rotas Data Docked/PREMIUM, cobrança, mapa, GPS, ícone do barco, camadas AIS, waypoints, rotas, batimetria e áreas do administrador mantêm a implementação V200. A alteração em AISPage envolve somente a pesquisa FREE.

## Documentação
https://globalfishingwatch.org/our-apis/documentation/docs/v3/vessels/search
https://globalfishingwatch.org/our-apis/documentation/docs/examples/vessels/vessels-example1

## Limitação de validação
A consulta real GFW depende do token configurado no servidor. O pacote não contém credenciais para validar dados reais da conta nem os serviços PREMIUM em produção.

## Verificações executadas
- Build de produção Next.js: aprovado.
- Testes com respostas simuladas: autenticação, token ausente, validação, normalização, paginação, limite 429, falha de autorização do provedor, resposta inválida e falha de rede aprovados.
- Typecheck: os mesmos quatro erros preexistentes na V200, em position-forecast, trecho antigo do AISPage e positionForecastPdf. Sem erros adicionais. A configuração original já permite build com esses erros; ela não foi alterada.
- Comparação dos arquivos: endpoints PREMIUM, cobrança, mapa e navegação preservados.
- Não houve teste autenticado em produção nem validação visual em celular físico.
- Ambiente de build local: Node 24; o projeto mantém a exigência original Node 22 na hospedagem.
