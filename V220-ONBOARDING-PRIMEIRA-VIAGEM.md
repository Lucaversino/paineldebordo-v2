# V220 — Onboarding da primeira viagem

Atualização focada somente no primeiro acesso, preservando os módulos existentes do Painel de Bordo.

## Fluxo novo

1. Conta sem embarcação abre automaticamente **Embarcações** e o cadastro do primeiro barco.
2. O código/matrícula interna é gerado automaticamente: `01`, `02`, `03`...
3. **Corvina** é garantida automaticamente na lista de espécies de cada usuário, sem duplicar por diferença de maiúsculas/minúsculas.
4. Depois de salvar o primeiro barco aparece o botão grande **COMECE SUA VIAGEM!**.
5. No Dashboard, enquanto ainda não existir nenhuma viagem, aparece o passo 2 com **CRIAR VIAGEM!** pulsando.
6. No formulário da viagem, Corvina fica pré-selecionada e é possível cadastrar outra espécie sem sair do formulário.
7. Ao salvar a primeira viagem, o onboarding termina automaticamente e aparece a mensagem de boas-vindas com atalho para **Ajuda**.

## UX

- Tutorial visual em 2 etapas somente antes da primeira viagem.
- Animações leves e compatíveis com `prefers-reduced-motion`.
- Inputs/selects dos modais aumentados para uso mais confortável no celular.
- Botões continuam bloqueados durante salvamento para evitar clique duplo.
- Usuários que já possuem viagens não entram no onboarding.

## Backend

- `/api/dashboard` agora devolve um resumo `onboarding` com contagem de barcos e viagens.
- `/api/manage` aceita barco novo sem matrícula manual e gera o próximo código numérico.
- Cadastro de espécies ganhou verificação case-insensitive contra duplicação.
- Criação da viagem aceita `speciesId` existente ou `speciesName` nova.
- A espécie Corvina é criada/reativada automaticamente por usuário quando necessário.

Nenhuma alteração foi feita nas regras de AIS, créditos, mapas, waypoints, capturas, largadas, PDFs, meteorologia ou FISH IA.
