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
