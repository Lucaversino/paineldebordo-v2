# V253 — Proteção da nova largada e compartilhamento GPS

- Nova largada: fechar pelo X, clicar fora da janela ou teclar ESC pede confirmação antes de descartar. Durante salvamento, fechamento manual fica bloqueado. Recarregar/fechar aba exibe aviso nativo do navegador.
- Dashboard: seção abaixo do conversor com botão para obter GPS e gerar GIF animado com logo, embarcação, coordenadas em graus/minutos, horário e precisão.
- Compartilhamento: Web Share API envia o arquivo GIF quando suportada. Em PC sem compartilhamento de arquivos, baixa o GIF e abre o WhatsApp com link Google Maps e coordenadas (é preciso anexar o GIF manualmente).
- Privacidade: geolocalização é acionada sob demanda, exige permissão e HTTPS. O GIF não é enviado ao banco de dados.
- Dependência adicionada: gifenc ^1.0.3, instalar com `npm install` antes do build.

**Validação:** instalação de dependências indisponível neste ambiente; não foi possível rodar `npm run build` ou teste de navegador. Recomendado validar em PWA Android/iOS e desktop antes de produção.
