"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, LockKeyhole, ShipWheel } from "lucide-react";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let live = true;
    const client = createSupabaseBrowserClient();
    // A rota /auth/callback troca o código de recuperação por uma sessão segura.
    client.auth.getSession().then(({ data, error }) => {
      if (live) { setReady(Boolean(data.session) && !error); if (!data.session || error) setError("Link inválido ou expirado. Solicite uma nova recuperação na tela de login."); }
    }).catch(() => { if (live) setError("Não foi possível validar o link. Tente novamente."); });
    return () => { live = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As duas senhas não coincidem.");
    setBusy(true); setError("");
    try {
      const client = createSupabaseBrowserClient();
      const { data: session } = await client.auth.getSession();
      if (!session.session) throw new Error("Sessão de recuperação expirada. Solicite outro link.");
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      await client.auth.signOut();
      setSuccess(true); setPassword(""); setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível redefinir a senha.");
    } finally { setBusy(false); }
  }

  return <main className="loginpage"><div className="login-shell"><section className="logincard">
    <div className="loginbrand"><ShipWheel /></div><small>PAINEL DE BORDO</small>
    <h1>{success ? "Senha alterada" : "Criar nova senha"}</h1>
    <p>{success ? "Sua senha foi atualizada. Entre novamente com o e-mail e a nova senha." : "Escolha uma senha segura para acessar seu painel."}</p>
    {!success && ready && <form className="loginform" onSubmit={submit}>
      <label className="loginfield"><span>Nova senha</span><div className="login-input-wrap"><LockKeyhole/><input type={visible ? "text" : "password"} autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres"/><button type="button" className="password-toggle" aria-label={visible ? "Ocultar senha" : "Mostrar senha"} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff/> : <Eye/>}</button></div></label>
      <label className="loginfield"><span>Confirmar nova senha</span><div className="login-input-wrap"><LockKeyhole/><input type={visible ? "text" : "password"} autoComplete="new-password" minLength={8} required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repita a nova senha"/></div></label>
      <button className="primary-login" type="submit" disabled={busy}>{busy ? "SALVANDO..." : "SALVAR NOVA SENHA"}</button>
    </form>}
    {error && <p className="login-message error" role="alert">{error}</p>}
    <a className="switchaccount" href="/login">{success ? "IR PARA LOGIN" : "Voltar ao login e pedir outro link"}</a>
  </section></div></main>;
}
