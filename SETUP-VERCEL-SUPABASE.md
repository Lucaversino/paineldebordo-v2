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
