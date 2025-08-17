// scripts/pull-bitacora.mjs
// Sin dependencias externas (Node 20 trae fetch). Lee una lista de SharePoint vía Graph
// y guarda resultados en data/bitacora.json y data/bitacora.csv

import fs from "node:fs";
import path from "node:path";

// === Config desde secretos/entorno, con defaults a tus IDs conocidas ===
const TENANT_ID  = process.env.AZURE_TENANT_ID  || "837f64ee-b685-4a9d-b085-6dfef6829d62";
const CLIENT_ID  = process.env.AZURE_CLIENT_ID  || ""; // Pónlo en GitHub Secrets
const CLIENT_SEC = process.env.AZURE_CLIENT_SECRET || ""; // Pónlo en GitHub Secrets

const SITE_ID = process.env.BITACORA_SITE_ID ||
  "terrauniversalis.sharepoint.com,30518bf9-395d-40a6-8cec-677d78d17236,a74ba19e-889a-46b9-932e-39ca7665283a";
const LIST_ID = process.env.BITACORA_LIST_ID ||
  "63ebe210-ce78-4949-95b8-3337c51cfb4d"; // Raw
const OUT_DIR = process.env.BITACORA_OUT_DIR || "data";

// === Util ===
function levelName(n) {
  switch (Number(n)) {
    case 3: return "ERROR";
    case 2: return "WARN";
    case 1: return "INFO";
    default: return "DEBUG";
  }
}

function csvEscape(s) {
  const v = (s ?? "").toString();
  return /[",\n]/.test(v) ? `"${v.replaceAll('"','""')}"` : v;
}

// === Token de app (client credentials) ===
// Requiere en tu App Registration (Entra):
// Microsoft Graph -> Application permissions: Sites.Read.All  (conceder "Admin consent")
async function getAppToken() {
  if (!CLIENT_ID || !CLIENT_SEC) {
    throw new Error("Faltan AZURE_CLIENT_ID / AZURE_CLIENT_SECRET en los secretos del workflow.");
  }
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SEC,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });

  const tokenResp = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenResp.ok) {
    const txt = await tokenResp.text();
    throw new Error(`Token error ${tokenResp.status}: ${txt}`);
  }
  const json = await tokenResp.json();
  return json.access_token;
}

async function fetchBitacora(accessToken) {
  const url =
    `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(SITE_ID)}/lists/${LIST_ID}/items` +
    `?$expand=fields($select=Title,numero,Created)&$orderby=createdDateTime desc&$top=200`;

  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Graph error ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  const items = Array.isArray(data.value) ? data.value : [];

  return items.map(it => {
    const f = it.fields || {};
    const created = f.Created || it.createdDateTime || null;
    const lvlNum = Number.isFinite(f.numero) ? Number(f.numero) : 0;
    return {
      created,
      level: lvlNum,
      levelName: levelName(lvlNum),
      title: f.Title || "",
      id: it.id ?? null,
    };
  });
}

async function main() {
  console.log("Pull Bitácora: inicio…");
  const token = await getAppToken();
  const rows = await fetchBitacora(token);

  // Asegura carpeta de salida
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // JSON
  const jsonPath = path.join(OUT_DIR, "bitacora.json");
  fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), "utf8");

  // CSV
  const csvPath = path.join(OUT_DIR, "bitacora.csv");
  const header = "created,level,levelName,title\n";
  const body = rows
    .map(r => [r.created, r.level, r.levelName, r.title].map(csvEscape).join(","))
    .join("\n");
  fs.writeFileSync(csvPath, header + body + "\n", "utf8");

  console.log(`OK. Registros: ${rows.length}`);
  console.log(`Escrito: ${jsonPath}, ${csvPath}`);
}

main().catch(err => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
