# V97 — VesselFinder AIS incorporado

A V97 remove a aba MarineTraffic da interface e coloca o mapa AIS oficial incorporável do VesselFinder.

## Alterações

- nova aba **VesselFinder** no menu;
- removido o componente MarineTraffic/WebView da interface;
- mapa carregado pelo script oficial `https://www.vesselfinder.com/aismap.js`;
- funciona no navegador comum, Vercel e também dentro do aplicativo desktop;
- centraliza o mapa perto da última posição registrada da viagem quando houver coordenadas;
- fallback de centro em Santa Catarina: latitude `-27.15`, longitude `-48.55`;
- zoom inicial `8`;
- botão **Recarregar**;
- botão **Abrir VesselFinder** em nova aba;
- restante do Painel de Bordo permanece preservado.

## Arquivos principais

- `components/VesselFinderPage.tsx`
- `public/vesselfinder-map.html`
- `app/page.tsx`
- `package.json`

Versão: **97.0.0**
