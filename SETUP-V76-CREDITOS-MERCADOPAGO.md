# V76 — Créditos, AIS, IA e Mercado Pago

## O que entrou
- Uma única carteira por usuário para AIS e Painel IA.
- Valor padrão: 1 crédito = R$ 1,00, configurável pelo Super Admin.
- AIS simples: localizar barco = 2 créditos; atualizar posição = 2 créditos.
- IA: pergunta simples = 1 crédito; análise completa = 2; análise avançada = 3.
- Falhas de AIS/OpenAI não descontam créditos.
- Regra histórica da V76: Super Admin tinha AIS/IA grátis. **Na V84 isso foi substituído por saldo inicial único de 80 créditos, com consumo normal de AIS/IA.**
- Extrato de créditos.
- Compra de 10, 20, 50 ou 100 créditos via Mercado Pago Checkout Pro.
- Webhook consulta o pagamento diretamente no Mercado Pago antes de liberar créditos.
- Painel administrativo com receita, consumo, tokens e custos estimados.

## Variáveis da Vercel
Mantenha as variáveis atuais e adicione:

```env
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
PUBLIC_APP_URL=https://SEU-DOMINIO.vercel.app
SUPER_ADMIN_EMAIL=brendaelucas.765@gmail.com
```

`MERCADOPAGO_ACCESS_TOKEN` deve ser Secret e nunca usar prefixo `NEXT_PUBLIC_`.

## Banco
A aplicação cria as tabelas novas automaticamente no primeiro uso. O arquivo `supabase/schema.sql` também contém a estrutura completa para instalação manual.

Tabelas novas:
- `billing_settings`
- `credit_wallets`
- `credit_transactions`
- `ai_usage`
- `ais_usage`
- `payment_orders`

## Mercado Pago
O backend cria uma preferência Checkout Pro em `/api/payments/create`.
O webhook fica em:

`https://SEU-DOMINIO/api/payments/webhook`

A liberação dos créditos ocorre somente depois que o backend consulta o pagamento pelo ID recebido, confere status `approved`, `external_reference`, moeda e valor, e processa a compra de forma idempotente.

## Super Admin
A conta definida por `SUPER_ADMIN_EMAIL` recebe automaticamente:
- `role = super_admin`
- `free_ais_access = true`
- `free_ai_access = true`

O saldo não é descontado para AIS ou IA nessa conta.

## Custos reais para margem
Como o custo contratado do provedor AIS e o preço efetivo do modelo OpenAI podem variar, eles começam em zero no cálculo de margem. No menu Admin configure:
- custo interno AIS por chamada;
- custo OpenAI por 1 milhão de tokens de entrada;
- custo OpenAI por 1 milhão de tokens de saída.

Assim o painel passa a estimar custo total, resultado bruto e margem sem inventar valores.
