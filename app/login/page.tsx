"use client";

import { FormEvent, useMemo, useState } from "react";
import { LockKeyhole, LogIn, ShipWheel, UserPlus } from "lucide-react";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import PwaControls from "../../components/PwaControls";

export default function LoginPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      <section className="logincard">
        <div className="loginbrand"><ShipWheel /></div>
        <small>PAINEL DE BORDO</small>
        <h1>Pesca Industrial</h1>
        <p>Conta própria no Supabase para acessar embarcações, viagens, largadas, capturas e análises.</p>

        <div className="loginaccount">
          <LockKeyhole />
          <div>
            <span>{mode === "login" ? "Acesso seguro" : "Criar conta"}</span>
            <b>Supabase Auth</b>
            <small>Seus registros ficam separados por usuário.</small>
          </div>
        </div>

        <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
          {mode === "signup" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              autoComplete="name"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            required
            autoComplete="email"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
            minLength={6}
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {error && <p style={{ color: "#ff8d8d", margin: 0 }}>{error}</p>}
          {message && <p style={{ color: "#7fe2a9", margin: 0 }}>{message}</p>}
          <button type="submit" disabled={busy}>
            {mode === "login" ? <LogIn /> : <UserPlus />}
            {busy ? "AGUARDE..." : mode === "login" ? "ENTRAR" : "CRIAR CONTA"}
          </button>
        </form>

        <button type="button" className="loginbutton" onClick={loginGoogle} disabled={busy} style={{ marginTop: 10 }}>
          <LogIn /> ENTRAR COM GOOGLE
        </button>

        <button
          type="button"
          className="switchaccount"
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setMessage(""); }}
          style={{ border: 0, background: "transparent", cursor: "pointer" }}
        >
          {mode === "login" ? "Ainda não tem conta? Criar conta" : "Já tenho conta"}
        </button>

        <footer>Autenticação pelo Supabase. Banco PostgreSQL hospedado no Supabase.</footer>
        <PwaControls login />
      </section>
    </main>
  );
}
