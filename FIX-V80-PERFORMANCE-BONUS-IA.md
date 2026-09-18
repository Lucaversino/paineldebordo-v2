# V80 — desempenho + bônus inicial do Painel IA

## O que ficou mais leve

- Dashboard deixa de carregar AIS, Ventos/Mar, Administração, Operações e Recharts no pacote inicial; esses módulos entram sob demanda.
- O gráfico de produção virou um chunk separado.
- A sessão inicial não abre a carteira nem consulta configurações financeiras apenas para descobrir o Super Admin.
- Configurações de cobrança ficam em cache no servidor por 60 segundos.
- Carteira deixou de fazer UPSERT em todo request; agora lê primeiro e só grava quando necessário.
- Pool PostgreSQL usa até 3 conexões por instância para permitir consultas paralelas no Transaction Pooler.
- As quatro consultas principais do Dashboard rodam em paralelo depois de identificar a viagem atual.
- Inteligência Oceânica carrega depois do conteúdo principal, tem timeout nas fontes externas e cache curto de 2 minutos.
- O chat antigo embutido na Inteligência Oceânica foi removido; permanece apenas o botão flutuante global do Painel IA.
- O preenchimento histórico ambiental não roda mais automaticamente no carregamento. Continua disponível manualmente em Configurações.
- Ao salvar uma nova largada, a largada/captura é confirmada primeiro e o snapshot ambiental é coletado com `after()` em segundo plano.

## Bônus de R$ 2,00 no Painel IA

- Cada carteira criada a partir da V80 recebe `R$ 2,00` de bônus exclusivo para o Painel IA.
- O bônus NÃO pode ser usado no AIS.
- O bônus é consumido antes dos créditos comprados.
- Se o bônus cobrir só parte de uma análise, o restante é cobrado da carteira normal.
- Super Admin continua com AIS e IA grátis e não precisa do bônus.
- Usuários/carteiras existentes antes da migração não recebem o bônus retroativamente.
- O valor é configurável no Admin por `AI_WELCOME_BONUS_BRL` e começa em `2.00`.

## Banco

A V80 migra automaticamente a tabela `credit_wallets` na primeira execução, adicionando:

- `ai_bonus_brl`
- `ai_bonus_granted`

A migração grava `BILLING_SCHEMA_VERSION=80` para não repetir DDL em todo cold start.

Nenhuma nova variável de ambiente da Vercel é necessária.
