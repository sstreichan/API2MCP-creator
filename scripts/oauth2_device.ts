/*
 OAuth2 Device Code helper: start device flow and poll; writes AUTH_TOKEN to .env.local.
 Env: DEVICE_AUTH_URL, TOKEN_URL, CLIENT_ID, SCOPE (optional), OUTPUT_ENV (.env.local)
*/
import fs from 'node:fs';
import path from 'node:path';

const DEVICE_AUTH_URL = process.env['DEVICE_AUTH_URL'] ?? '';
const TOKEN_URL = process.env['TOKEN_URL'] ?? '';
const CLIENT_ID = process.env['CLIENT_ID'] ?? '';
const SCOPE = process.env['SCOPE'] ?? '';
const OUTPUT_ENV = process.env['OUTPUT_ENV'] ?? '.env.local';

if (!DEVICE_AUTH_URL || !TOKEN_URL || !CLIENT_ID) { console.error('Missing DEVICE_AUTH_URL, TOKEN_URL, or CLIENT_ID'); process.exit(1); }

async function startDevice(){
  const body = new URLSearchParams(); body.set('client_id', CLIENT_ID); if (SCOPE) body.set('scope', SCOPE);
  const res = await fetch(DEVICE_AUTH_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body } as any);
  if (!res.ok) { const t = await res.text(); throw new Error(`HTTP ${res.status}: ${t}`); }
  return await res.json() as any;
}

async function pollToken(device_code: string, interval: number){
  const body = new URLSearchParams(); body.set('grant_type','urn:ietf:params:oauth:grant-type:device_code'); body.set('device_code', device_code); body.set('client_id', CLIENT_ID);
  for(;;){
    await new Promise(r=>setTimeout(r, interval*1000));
    const res = await fetch(TOKEN_URL, { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body } as any);
    const json = await res.json().catch(()=>({}));
    if (res.ok && json.access_token) return json.access_token as string;
    const err = json.error as string | undefined;
    if (err === 'authorization_pending') continue;
    if (err === 'slow_down') { interval += 5; continue; }
    throw new Error(`Token error: ${JSON.stringify(json)}`);
  }
}

function writeEnv(token: string){
  const p = path.resolve(process.cwd(), OUTPUT_ENV);
  const lines = [ `AUTH_MODE=bearer`, `AUTH_TOKEN=${token}` ];
  const prev = fs.existsSync(p) ? fs.readFileSync(p,'utf8') : '';
  const filtered = prev.split(/\r?\n/).filter(l=>!l.startsWith('AUTH_MODE=') && !l.startsWith('AUTH_TOKEN=')).join('\n');
  const out = (filtered ? filtered + '\n' : '') + lines.join('\n') + '\n';
  fs.writeFileSync(p, out);
  console.log(p);
}

async function main(){
  const d = await startDevice();
  console.log(JSON.stringify({ device_code: d.device_code, user_code: d.user_code, verification_uri: d.verification_uri, verification_uri_complete: d.verification_uri_complete, interval: d.interval }, null, 2));
  const token = await pollToken(d.device_code, d.interval ?? 5);
  writeEnv(token);
}

main().catch((e)=>{ console.error(e); process.exit(1); });

