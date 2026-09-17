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
];

for (const path of legacyPaths) {
  await rm(path, { recursive: true, force: true });
}

console.log("Legacy Vinext/Cloudflare D1 files removed before build.");
