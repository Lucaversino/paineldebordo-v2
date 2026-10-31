# V268 PWA Android/iPhone
- Instalação iniciada por ação explícita do usuário; instalação silenciosa não é permitida.
- Android: evento nativo `beforeinstallprompt` quando elegível; instruções manuais se indisponível.
- iOS: orientação Safari → Compartilhar → Adicionar à Tela de Início.
- Oculta os convites em modo standalone; permite dispensar o aviso na sessão.
- Atualização do service worker e correção de `/offline.html`.
- Não coloca páginas autenticadas, dados operacionais ou respostas de API no cache do service worker.
- Cache somente para assets PWA públicos. O modo offline de dados operacionais permanece dependente da implementação existente do projeto.
- Requer HTTPS, ícones válidos e teste real em Chrome Android / Safari iOS.
