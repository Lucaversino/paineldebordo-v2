# V82 — Checkout 100% PIX

A compra de créditos agora usa pagamento PIX direto pela API do Mercado Pago.

## Fluxo

1. Usuário escolhe 10, 20, 50 ou 100 créditos.
2. Informa o CPF do pagador (não é salvo pelo Painel).
3. O backend cria o pagamento em `POST https://api.mercadopago.com/v1/payments` com `payment_method_id: pix`.
4. O Painel exibe o `qr_code_base64` e o `qr_code` (Pix Copia e Cola).
5. A interface verifica o status automaticamente e também oferece o botão `JÁ PAGUEI · VERIFICAR AGORA`.
6. Os créditos só entram quando o Mercado Pago devolver `status=approved` e o valor/BRL baterem com o pedido.
7. O webhook `/api/payments/webhook` continua confirmando pagamentos mesmo se o usuário fechar a tela.

## Vercel

Obrigatório:

- `MERCADOPAGO_ACCESS_TOKEN` — Access Token de produção da MESMA aplicação Mercado Pago configurada no webhook.
- `PUBLIC_APP_URL=https://paineldebordo.vercel.app`

Não é necessário expor Access Token no navegador.

## Webhook Mercado Pago

URL de produção:

`https://paineldebordo.vercel.app/api/payments/webhook`

Evento: `Pagamentos (legacy)` / payment.

## Segurança

- QR Code é dinâmico e de uso único para o pedido.
- `X-Idempotency-Key` evita criação duplicada acidental.
- O CPF não é persistido no banco do Painel.
- O webhook/status consulta o pagamento diretamente no Mercado Pago antes de liberar créditos.
- A transação de banco bloqueia o pedido para impedir crédito duplicado.
