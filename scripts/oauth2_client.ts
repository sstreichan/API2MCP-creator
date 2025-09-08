/*
 OAuth2 Client Credentials helper: fetch access_token and write to .env.local
 Env: TOKEN_URL, CLIENT_ID, CLIENT_SECRET, SCOPE (optional), OUTPUT_ENV (default .env.local)
*/
import fs from 'node:fs';
import path from 'node:path';

const TOKEN_URL = process.env['TOKEN_URL'] ?? '';
const CLIENT_ID = process.env['CLIENT_ID'] ?? '';
const CLIENT_SECRET = process.env['CLIENT_SECRET'] ?? '';
const SCOPE = process.env['SCOPE'] ?? '';
const OUTPUT_ENV = process.env['OUTPUT_ENV'] ?? '.env.local';

if (!TOKEN_URL || !CLIENT_ID || !CLIENT_SECRET) { console.error('Missing TOKEN_URL, CLIENT_ID, or CLIENT_SECRET'); process.exit(1); }

async function getToken(){
  const body = new URLSearchParams();
  body.set('grant_type','client_credentials');
  if (SCOPE) body.set('scope', SCOPE);
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${auth}` }, body } as any);
  if (!res.ok) { const t = await res.text(); throw new Error(`HTTP ${res.status}: ${t}`); }
  return await res.json() as any;
}

function writeEnv(token: string){
  const p = path.resolve(process.cwd(), OUTPUT_ENV);
  const lines = [
    `AUTH_MODE=bearer`,
    `AUTH_TOKEN=${token}`
  ];
  try {
    const prev = fs.existsSync(p) ? fs.readFileSync(p,'utf8') : '';
    const filtered = prev.split(/\r?\n/).filter(l=>!l.startsWith('AUTH_MODE=') && !l.startsWith('AUTH_TOKEN=')).join('\n');
    const out = (filtered ? filtered + '\n' : '') + lines.join('\n') + '\n';
    fs.writeFileSync(p, out);
    console.log(p);
  } catch (e) { console.error(String(e)); process.exit(1); }
}

async function main(){
  const tok = await getToken();
  const token = tok.access_token as string;
  if (!token) throw new Error('No access_token in response');
  writeEnv(token);
}

main().catch((e)=>{ console.error(e); process.exit(1); });

