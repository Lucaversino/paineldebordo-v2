# V260: Recuperação de senha

- Tela de login: botão Esqueci minha senha, validação do e-mail e envio via Supabase Auth.
- Redirecionamento seguro para /auth/callback?next=/reset-password, usando PKCE/código de autorização.
- Nova tela /reset-password: valida sessão, solicita nova senha e confirmação, atualiza com Supabase e encerra a sessão.
- Não exige alteração no banco de dados.

## Configuração obrigatória no Supabase
Em Authentication → URL Configuration, cadastrar como Redirect URL:
`https://SEU-DOMINIO/auth/callback?next=/reset-password`
Para o domínio de produção, manter o mesmo domínio efetivamente usado na tela de login. Configure SMTP de produção em Authentication → SMTP Settings para entregar e-mails com confiabilidade.

## Teste
1. Clicar Esqueci minha senha; informar o e-mail; receber o link.
2. Abrir o link, definir a nova senha, confirmar e entrar novamente.
3. Testar link expirado e senha divergente.
