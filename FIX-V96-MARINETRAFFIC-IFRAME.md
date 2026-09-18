# V96 — aba MarineTraffic por iframe

Continuação direta da V95.

## Alterações

- Nova opção **MarineTraffic** no menu lateral, posicionada logo abaixo do AIS.
- Nova página responsiva com iframe apontando para:
  `https://www.marinetraffic.com/en/ais/home/centerx:3.7/centery:2.4/zoom:5`
- Botão **Recarregar** para recriar o iframe.
- Botão **Abrir fora** como alternativa para abrir o MarineTraffic em nova aba.
- O iframe só é carregado quando a nova aba é selecionada, para não pesar o Dashboard/AIS existente.
- Nenhuma rota AIS, crédito, Fish AI, viagem, captura ou banco foi alterada.

## Observação sobre iframe externo

A renderização de um site externo em iframe também depende das regras de segurança enviadas pelo próprio site externo (`X-Frame-Options` / CSP `frame-ancestors`). Caso o MarineTraffic bloqueie incorporação para domínios terceiros, o navegador poderá impedir o conteúdo dentro do iframe; por isso a página mantém o botão **Abrir fora**.
