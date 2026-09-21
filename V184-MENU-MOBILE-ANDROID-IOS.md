# V184 — Menu mobile Android + iPhone

- Corrige o menu lateral que podia aparecer transparente/inacessível no Android.
- Drawer agora usa fundo sólido `#071b22`, sem `backdrop-filter` e sem animação de opacidade.
- Abertura/fechamento usa apenas `translateX`, mais estável em Chrome Android, WebView e Safari/PWA.
- Mantém safe-area para notch/Dynamic Island no iPhone.
- Botão do menu permanece clicável e visível no mobile.
- Drawer e backdrop usam camadas/z-index separados.
- Navegação interna continua rolável e com alvos de toque maiores.
- Mantém a barra de consumo de internet mesmo sem viagem.
- Nenhuma alteração em AIS, GPS, previsão, clorofila, créditos ou pagamentos.
