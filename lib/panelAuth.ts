import { createSupabaseServerClient } from "./supabase/server";

export type PanelUser = {
  id: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

export async function getPanelUser(): Promise<PanelUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const user = data.user;
  const fullName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    null;
  const email = user.email || "";
  return {
    id: user.id,
    email,
    fullName,
    displayName: fullName || email || "Usuário",
  };
}

export async function requirePanelUserResponse() {
  const user = await getPanelUser();
  return user
    ? { user, response: null }
    : {
        user: null,
        response: Response.json(
          { error: "Sessão encerrada. Entre novamente no painel." },
          { status: 401 },
        ),
      };
}


export async function getPanelUserFromRequest(request?: Request): Promise<PanelUser | null> {
  // 1) Caminho normal: sessão Supabase armazenada nos cookies do painel.
  const cookieUser = await getPanelUser();
  if (cookieUser) return cookieUser;

  // 2) Fallback importante para PWA/mobile e sessões recém-renovadas:
  // o cliente AIS também envia o access token no header Authorization.
  const authorization = request?.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const accessToken = match?.[1]?.trim();
  if (!accessToken) return null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) return null;
    const user = data.user;
    const fullName =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      null;
    const email = user.email || "";
    return {
      id: user.id,
      email,
      fullName,
      displayName: fullName || email || "Usuário",
    };
  } catch {
    return null;
  }
}
