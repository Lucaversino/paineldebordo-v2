# V96 — MarineTraffic em WebView real

Esta variante da V96 remove o iframe do MarineTraffic e adiciona um **WebView real via Electron**.

## Como funciona

- No Chrome/Edge/Vercel: a aba MarineTraffic mostra um aviso e o botão **Abrir MarineTraffic**. Não usa iframe.
- No aplicativo desktop Electron: a mesma aba renderiza o MarineTraffic dentro de um `<webview>` (Chromium separado), portanto não depende de permissão de iframe do site.
- O WebView possui Voltar, Avançar, Recarregar, Home e Abrir no navegador externo.
- Cookies/sessão do MarineTraffic ficam persistentes na partição `persist:marinetraffic`.
- Node.js fica desativado dentro do conteúdo externo.

## Importante

O WebView é um recurso de aplicativo desktop, não do Vercel. A versão web continua funcionando normalmente, mas o MarineTraffic embutido só aparece quando o painel é aberto pelo aplicativo Electron.

## Executar no Windows

1. Instale Node.js 22.
2. Execute `INICIAR-WEBVIEW-WINDOWS.bat`.
3. Na primeira execução, as dependências serão instaladas.
4. O app carrega por padrão `https://paineldebordo.vercel.app`.

Para usar outro endereço do painel:

```bat
set PANEL_URL=https://SEU-PAINEL.vercel.app
npm run desktop
```

## Gerar instalador Windows

```bash
npm install
npm run desktop:dist
```

O instalador será criado na pasta `dist-desktop`.
