#!/usr/bin/env node
/**
 * Baixa Cartas Raster KAP/BSB oficiais do CHM/DHN.
 * Sem dependências externas. Requer Node.js 18+.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
const SOURCE = manifest.source;
const outBase = path.join(__dirname, "downloads");

const wantedByNumber = new Map();
for (const [group, charts] of Object.entries(manifest.groups)) {
  for (const chart of charts) {
    const item = wantedByNumber.get(chart.number) || {...chart, groups: []};
    if (!item.groups.includes(group)) item.groups.push(group);
    wantedByNumber.set(chart.number, item);
  }
}

function cleanText(html) {
  return html.replace(/<[^>]+>/g, " ")
             .replace(/&nbsp;/g, " ")
             .replace(/&amp;/g, "&")
             .replace(/&#039;/g, "'")
             .replace(/&quot;/g, '"')
             .replace(/\s+/g, " ")
             .trim();
}

function resolveRows(html) {
  const found = new Map();
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const text = cleanText(row);
    const numMatch = text.match(/^(\d{1,5}[A-Z]?)\b/i);
    if (!numMatch) continue;
    const number = numMatch[1].toUpperCase();
    if (!wantedByNumber.has(number)) continue;

    const hrefs = [...row.matchAll(/href=["']([^"']+\.zip(?:\?[^"']*)?)["']/gi)].map(m => m[1]);
    const rasterHref = hrefs.find(h => !/geotiff/i.test(h));
    if (!rasterHref) continue;

    const url = new URL(rasterHref, SOURCE).href;
    found.set(number, {url, rowText: text});
  }
  return found;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 Painel-de-Bordo-Cartas-Raster/1.0",
      "Accept": "text/html,application/xhtml+xml"
    },
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return await res.text();
}

async function downloadFile(url, dest) {
  const res = await fetch(url, {
    headers: {"User-Agent": "Mozilla/5.0 Painel-de-Bordo-Cartas-Raster/1.0"},
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const total = Number(res.headers.get("content-length") || 0);
  const file = fs.createWriteStream(dest);
  let received = 0;
  for await (const chunk of res.body) {
    received += chunk.length;
    file.write(chunk);
    if (total) {
      const pct = ((received / total) * 100).toFixed(1);
      process.stdout.write(`\r  ${pct}%  `);
    }
  }
  file.end();
  await new Promise((resolve, reject) => {
    file.on("finish", resolve);
    file.on("error", reject);
  });
  process.stdout.write("\n");
}

fs.mkdirSync(outBase, {recursive: true});

console.log("Consultando a tabela oficial do CHM...");
const html = await fetchText(SOURCE);
const links = resolveRows(html);

const missing = [...wantedByNumber.keys()].filter(n => !links.has(n));
if (missing.length) {
  console.warn("Não encontrei na tabela atual:", missing.join(", "));
}

const downloaded = new Set();

for (const [number, chart] of wantedByNumber.entries()) {
  const resolved = links.get(number);
  if (!resolved) continue;
  const filename = decodeURIComponent(new URL(resolved.url).pathname.split("/").pop());
  const commonDest = path.join(outBase, "_TODAS");
  fs.mkdirSync(commonDest, {recursive: true});
  const dest = path.join(commonDest, filename);

  if (!downloaded.has(number)) {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(`[${number}] já existe: ${filename}`);
    } else {
      console.log(`[${number}] ${chart.title}\n  ${resolved.url}`);
      try {
        await downloadFile(resolved.url, dest);
      } catch (err) {
        console.error(`  FALHOU: ${err.message}`);
        continue;
      }
    }
    downloaded.add(number);
  }

  // Cria arquivo .url por grupo apontando para o arquivo comum, sem duplicar binários.
  for (const group of chart.groups) {
    const groupDir = path.join(outBase, group);
    fs.mkdirSync(groupDir, {recursive: true});
    const pointer = path.join(groupDir, `${number} - ${chart.title}.txt`);
    fs.writeFileSync(pointer, `Carta: ${number} - ${chart.title}\nArquivo: ../_TODAS/${filename}\nFonte: ${resolved.url}\n`, "utf8");
  }
}

console.log("\nConcluído.");
console.log(`Arquivos: ${path.join(outBase, "_TODAS")}`);
console.log("Depois rode: python 02_extrair_kap.py");
