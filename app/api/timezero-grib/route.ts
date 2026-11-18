// Rota legada: mantém compatibilidade com o botão antigo de exportação.
// O Next.js 16 exige valores literais de configuração em cada route.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export { GET } from "../timezero-export/route";
