# Publicação rápida — Vercel + Supabase

1. Crie um projeto no Supabase.
2. Supabase > SQL Editor: execute `supabase/schema.sql`.
3. Supabase > Project Settings/API: copie URL e anon key.
4. Supabase > Connect: copie a **Transaction Pooler / Supavisor** connection string (porta 6543) e coloque a senha do banco.
5. Na Vercel, configure:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `DATABASE_URL`
6. Supabase > Authentication > URL Configuration:
   - Site URL = URL final da Vercel
   - Redirect URL = `https://SEU-DOMINIO/auth/callback`
7. Se quiser login Google, habilite Google em Authentication > Providers.
8. Faça deploy com preset **Next.js**. Não configure Output Directory manualmente.

O build agora é `next build` e gera `.next`, exatamente o formato esperado pela Vercel.

## 8. Ativar o PAINEL IA (OpenAI) — v52

No projeto da Vercel, abra **Settings → Environment Variables** e crie:

```text
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_REASONING_EFFORT
```

Valores sugeridos:

```text
OPENAI_MODEL=gpt-5.6-sol
OPENAI_REASONING_EFFORT=high
```

`OPENAI_API_KEY` deve ser do tipo **Secret** e nunca deve receber o prefixo `NEXT_PUBLIC_`.

Depois de salvar, faça um novo **Redeploy**. No dashboard, o selo do assistente deve mudar de **Aguardando API OpenAI** para **GPT-5.6 Sol • high**.


## 9. Ventos e Mar por posição — v53

A aba **Ventos e Mar** não exige nova variável de ambiente. Ela usa as fontes públicas já integradas no servidor (Open-Meteo e NOAA CoastWatch).

O operador pode digitar latitude/longitude no formato rápido das largadas ou usar a posição da última largada registrada.
