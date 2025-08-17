// scripts/pull-bitacora.mjs
// Lee items de la lista "Raw" en tu SharePoint con Microsoft Graph (client credentials)
// y escribe data/bitacora.json y data/bitacora.csv

import fs from "node:fs";
import path from "node:path";

// === Config desde secretos ===
const TENANT_ID  = process.env.AZURE_TENANT_ID  || "837f64ee-b685-4a9d-b085-6dfef6829d62";
const CLIENT_ID  = process.env.AZURE_CLIENT_ID  || ""; // en GitHub Secrets
const CLIENT_SEC = process.env.AZURE_CLIENT_SECRET || ""; // en GitHub Secrets

const SITE_ID = process.env.BITACORA_SITE_ID ||
  "terrauniversalis.sharepoint.com,30518bf9-395d-40a6-8cec-677d78d17236,a74ba19e-889a-46b9-932e-39ca7665283a";
const LIST_ID = process.env.BITACORA_LIST_ID ||
  "63ebe210-ce78-4949-95b8-3337c51cfb4d"; // Raw
const OUT_DIR = process.env.BITACORA_OUT_DIR || "data";

function levelName(n){ return n==3?"ERROR":n==2?"WARN":n==1?"INFO":"DEBUG"; }
function csvEscape(s){ const v=(s??"").toString(); return /[",\n]/.test(v)?`"${v.replaceAll('"','""')}"`:v; }

async function getAppToken(){
  if(!CLIENT_ID || !CLIENT_SEC) throw new Error("Faltan AZURE_CLIENT_ID / AZURE_CLIENT_SECRET");
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SEC,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method:"POST", headers:{ "Content-Type":"application/x-www-form-urlencoded" }, body
  });
  if(!r.ok){ throw new Error(`Token ${r.status}: ${await r.text()}`); }
  return (await r.json()).access_token;
}

async function fetchBitacora(token){
  const url = `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(SITE_ID)}/lists/${LIST_ID}/items` +
              `?$expand=fields($select=Title,numero,Created)&$orderby=createdDateTime desc&$top=200`;
  const r = await fetch(url, { headers:{ Authorization:`Bearer ${token}` }});
  if(!r.ok){ throw new Error(`Graph ${r.status}: ${await r.text()}`); }
  const data = await r.json();
  const items = Array.isArray(data.value)? data.value : [];
  return items.map(it=>{
    const f = it.fields || {};
    const created = f.Created || it.createdDateTime || null;
    const lvl = Number.isFinite(f.numero)? Number(f.numero) : 0;
    return { id: it.id ?? null, created, level:lvl, levelName:levelName(lvl), title: f.Title || "" };
  });
}

async function main(){
  console.log("Pull Bitácora: inicio…");
  const token = await getAppToken();
  const rows = await fetchBitacora(token);

  fs.mkdirSync(OUT_DIR, { recursive:true });
  fs.writeFileSync(path.join(OUT_DIR,"bitacora.json"), JSON.stringify(rows,null,2), "utf8");

  const header = "created,level,levelName,title\n";
  const body = rows.map(r => [r.created, r.level, r.levelName, r.title].map(csvEscape).join(",")).join("\n");
  fs.writeFileSync(path.join(OUT_DIR,"bitacora.csv"), header + body + "\n", "utf8");

  console.log(`OK. Registros: ${rows.length}`);
}
main().catch(e=>{ console.error("ERROR:", e.message); process.exit(1); });
