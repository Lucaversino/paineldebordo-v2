import { rm } from "node:fs/promises";

// These folders belong to the old Vinext / Cloudflare D1 scaffold and are not
// part of the production Next.js + Supabase application.  GitHub's web upload
// can leave previously tracked files behind, so Vercel removes them before
// `next build` and TypeScript validation.
const legacyPaths = [
  "build",
  "examples",
  "scripts",
  ".sites-runtime",
  "tests",
  "vendor",
  // Legacy AISStream WebSocket route from v56/v57. A V93 usa a nova rota
  // app/api/ais-map para a camada automática; o caminho antigo continua removido
  // para evitar conflito com arquivos rastreados de versões anteriores.
  "app/api/ais-stream",
];

for (const path of legacyPaths) {
  await rm(path, { recursive: true, force: true });
}

console.log("Legacy files (including obsolete AISStream route) removed before build.");
