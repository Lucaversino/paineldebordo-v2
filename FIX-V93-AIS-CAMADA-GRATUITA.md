# V93 — Camada AIS automática gratuita

A V93 mantém toda a pesquisa AIS manual já existente e adiciona uma camada automática de embarcações no mapa.

## Fonte dos barcos do mapa

1. **AISStream** é a fonte principal (`AISSTREAM_API_KEY`).
2. Se o AISStream estiver realmente indisponível (chave ausente/recusada, falha de conexão ou assinatura não confirmada), o backend tenta **VesselAPI Free** (`VESSELAPI_API_KEY`). Uma região simplesmente sem mensagens no intervalo não aciona o fallback, preservando a cota pequena do plano Free.
3. Nenhuma dessas visualizações automáticas chama a carteira de créditos do usuário.
4. A pesquisa manual por nome, atualização individual e busca manual por área continuam no endpoint antigo e preservam a cobrança já configurada.

## Segurança

As chaves ficam exclusivamente nas variáveis de ambiente do backend. Nenhuma chave usa prefixo `NEXT_PUBLIC_` e nenhuma credencial é enviada ao navegador.

## Cache e desempenho

- cache em memória por célula geográfica;
- AISStream: cache fresco de 45 segundos e cache de contingência por até 5 minutos;
- VesselAPI: cache de 5 minutos e contingência por até 15 minutos;
- requisições simultâneas para a mesma região são consolidadas;
- no máximo duas coletas AISStream simultâneas por instância;
- os marcadores automáticos ficam em uma camada OpenLayers separada da pesquisa manual;
- nomes no mapa só aparecem em zoom mais próximo para manter celular e desktop rápidos.

## Dados exibidos

Ao tocar em uma embarcação automática, o painel usa os dados reais retornados pela fonte: nome quando disponível, MMSI, latitude/longitude, velocidade, rumo, proa, horário e fonte. Quando o provedor não informa o nome, é exibido somente o identificador MMSI — nenhuma embarcação é inventada.
