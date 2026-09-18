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
  // Legacy AISStream WebSocket route from v56/v57. The current AIS uses Data Docked HTTP API.
  // GitHub web uploads can leave this old tracked route behind and break Turbopack
  // when its old dependencies (@vercel/functions and ws) are no longer installed.
  "app/api/ais-stream",
];

for (const path of legacyPaths) {
  await rm(path, { recursive: true, force: true });
}

console.log("Legacy files (including obsolete AISStream WebSocket route) removed before build.");
