import fs from 'node:fs/promises';
import path from 'node:path';

const {
  AZURE_TENANT_ID,
  AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET,
  BITACORA_SITE_ID,
  BITACORA_LIST_ID,
  BITACORA_OUT_DIR = '.'
} = process.env;

const required = [
  'AZURE_TENANT_ID',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'BITACORA_SITE_ID',
  'BITACORA_LIST_ID'
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Falta variable de entorno: ${key}`);
  }
}

async function getAccessToken() {
  const url =
    `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token error ${res.status}: ${text}`);
  }

  const json = await res.json();
  return json.access_token;
}

async function getListItems(token) {
  const url =
    `https://graph.microsoft.com/v1.0/sites/${BITACORA_SITE_ID}` +
    `/lists/${BITACORA_LIST_ID}/items` +
    `?$expand=fields&$top=999`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph error ${res.status}: ${text}`);
  }

  const json = await res.json();
  return json.value ?? [];
}

function normalizeItems(items) {
  return items.map((item) => ({
    id: item.id,
    createdDateTime: item.createdDateTime ?? null,
    lastModifiedDateTime: item.lastModifiedDateTime ?? null,
    webUrl: item.webUrl ?? null,
    fields: item.fields ?? {}
  }));
}

async function main() {
  const token = await getAccessToken();
  const items = await getListItems(token);
  const normalized = normalizeItems(items);

  const output = {
    generatedAt: new Date().toISOString(),
    source: {
      siteId: BITACORA_SITE_ID,
      listId: BITACORA_LIST_ID
    },
    count: normalized.length,
    items: normalized
  };

  const outDir = path.resolve(BITACORA_OUT_DIR);
  const outFile = path.join(outDir, 'bitacora.json');

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    outFile,
    JSON.stringify(output, null, 2),
    'utf8'
  );

  console.log(`Archivo generado: ${outFile}`);
  console.log(`Items: ${normalized.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
