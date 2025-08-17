import fs from "fs/promises";
import { ConfidentialClientApplication } from "@azure/msal-node";

const { TENANT_ID, CLIENT_ID, CLIENT_SECRET, SITE_ID, LIST_ID } = process.env;

const cca = new ConfidentialClientApplication({
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    clientSecret: CLIENT_SECRET,
  },
});

const { accessToken } = await cca.acquireTokenByClientCredential({
  scopes: ["https://graph.microsoft.com/.default"],
});

const base = "https://graph.microsoft.com/v1.0";
const url =
  `${base}/sites/${encodeURIComponent(SITE_ID)}/lists/${LIST_ID}/items` +
  `?$expand=fields($select=Title,numero,Created,Id)` +
  `&$orderby=Created desc&$top=200`;

const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
if (!res.ok) {
  const text = await res.text();
  throw new Error(`Graph ${res.status} ${res.statusText}\n${text}`);
}

const data = await res.json();
const items = (data.value ?? []).map(it => ({
  id: it.id,
  title: it.fields?.Title ?? "",
  levelNum: it.fields?.numero ?? null,     // 0=DEBUG,1=INFO,2=WARN,3=ERROR
  created: it.fields?.Created ?? null,
}));

await fs.mkdir("public", { recursive: true });
await fs.writeFile(
  "public/bitacora.json",
  JSON.stringify({ updatedAt: new Date().toISOString(), items }, null, 2)
);

console.log(`Wrote public/bitacora.json with ${items.length} items`);
