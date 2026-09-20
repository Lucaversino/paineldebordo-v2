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
  // O coletor AISStream V159 é um processo Node 24/7 para Railway.
  // Ele não faz parte do bundle Next.js da Vercel e é removido apenas
  // do workspace temporário durante o prebuild da aplicação web.
  "worker",
];

for (const path of legacyPaths) {
  await rm(path, { recursive: true, force: true });
}

console.log("Legacy files and Railway-only worker removed before Vercel/Next build.");
