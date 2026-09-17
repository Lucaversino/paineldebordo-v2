"use client";

import { FormEvent, useMemo, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, ShipWheel, User, UserPlus } from "lucide-react";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import PwaControls from "../../components/PwaControls";

function GoogleLogo() {
  return (
    <svg className="google-logo" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.72-.06-1.41-.18-2.08H12v3.94h5.38a4.6 4.6 0 0 1-2 3.02v2.52h3.24c1.9-1.75 2.98-4.34 2.98-7.4Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.64-2.43l-3.24-2.52c-.9.6-2.04.95-3.4.95-2.6 0-4.8-1.76-5.6-4.13H3.05v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 13.87A6 6 0 0 1 6.08 12c0-.65.11-1.28.32-1.87v-2.6H3.05A10 10 0 0 0 2 12c0 1.61.38 3.14 1.05 4.47l3.35-2.6Z" />
      <path fill="#EA4335" d="M12 6c1.47 0 2.78.5 3.82 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.95 5.53l3.35 2.6C7.2 7.76 9.4 6 12 6Z" />
    </svg>
  );
}

export default function LoginPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() || undefined } },
        });
        if (error) throw error;
        if (data.session) window.location.assign("/");
        else setMessage("Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre no painel.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        window.location.assign("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  async function loginGoogle() {
    setBusy(true);
    setError("");
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  return (
    <main className="loginpage">
      <div className="login-shell">
        <section className="logincard">
          <div className="loginbrand"><ShipWheel /></div>
          <small>PAINEL DE BORDO</small>
          <h1>{mode === "login" ? "Bem-vindo a bordo" : "Criar sua conta"}</h1>
          <p>{mode === "login" ? "Entre para acessar suas viagens, largadas, capturas e análises." : "Crie seu acesso para manter seus dados de pesca organizados e separados por usuário."}</p>

          <div className="loginaccount">
            <LockKeyhole />
            <div>
              <span>{mode === "login" ? "Acesso protegido" : "Cadastro protegido"}</span>
              <b>Supabase Auth</b>
              <small>Seus registros ficam separados por usuário.</small>
            </div>
          </div>

          <form onSubmit={submit} className="loginform">
            {mode === "signup" && (
              <label className="loginfield">
                <span>Nome</span>
                <div className="login-input-wrap">
                  <User />
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    autoComplete="name"
                  />
                </div>
              </label>
            )}

            <label className="loginfield">
              <span>E-mail</span>
              <div className="login-input-wrap">
                <Mail />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  required
                  autoComplete="email"
                />
              </div>
            </label>

            <label className="loginfield">
              <span>Senha</span>
              <div className="login-input-wrap">
                <LockKeyhole />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  minLength={6}
                  required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>

            {error && <p className="login-message error">{error}</p>}
            {message && <p className="login-message success">{message}</p>}

            <button type="submit" className="primary-login" disabled={busy}>
              {mode === "signup" && <UserPlus />}
              {busy ? "AGUARDE..." : mode === "login" ? "ENTRAR" : "CRIAR CONTA"}
            </button>
          </form>

          <div className="login-divider"><span>ou</span></div>

          <button type="button" className="google-button" onClick={loginGoogle} disabled={busy}>
            <GoogleLogo />
            <span>Continuar com o Google</span>
          </button>

          <button
            type="button"
            className="switchaccount"
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setMessage(""); }}
          >
            {mode === "login" ? <>Ainda não tem conta? <b>Criar conta</b></> : <>Já possui cadastro? <b>Entrar</b></>}
          </button>

          <footer>
            <span>Autenticação segura com Supabase</span>
            <PwaControls login />
          </footer>
        </section>
      </div>
    </main>
  );
}
