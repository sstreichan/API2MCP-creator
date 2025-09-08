/* Throttled GET probe for a list of paths. Env: API_BASE, AUTH_*, PROBE_DELAY_MS */
import { loadLocalEnv } from './_load_env.js';
loadLocalEnv();

const BASE = process.env['API_BASE'] ?? '';
const AUTH_MODE = (process.env['AUTH_MODE'] ?? 'none').toLowerCase();
const AUTH_TOKEN = process.env['AUTH_TOKEN'] ?? '';
const AUTH_HEADER = process.env['AUTH_HEADER'] ?? 'Authorization';
const AUTH_QUERY_KEY = process.env['AUTH_QUERY_KEY'] ?? 'api_key';
const DELAY = Number(process.env['PROBE_DELAY_MS'] ?? '1000');

if (!BASE) { console.error('Missing API_BASE'); process.exit(1); }

function url(p: string): string { const b = BASE.endsWith('/') ? BASE.slice(0,-1) : BASE; const path = p.startsWith('/') ? p : `/${p}`; const u = `${b}${path}`; return applyAuth(u); }
function applyAuth(u: string): string {
  if (AUTH_MODE === 'bearer' || AUTH_MODE === 'header' || AUTH_MODE === 'basic') return u; // header only
  if (AUTH_MODE === 'query') return addQuery(u); return u;
}
function addQuery(u: string): string { try { const x = new URL(u); x.searchParams.set(AUTH_QUERY_KEY, AUTH_TOKEN); return x.toString(); } catch { return u + (u.includes('?')?'&':'?') + `${AUTH_QUERY_KEY}=${encodeURIComponent(AUTH_TOKEN)}`; } }
function baseHeaders(): Record<string,string> { const h: Record<string,string> = { 'Content-Type': 'application/json' }; if (AUTH_MODE==='bearer') h['Authorization']=`Bearer ${AUTH_TOKEN}`; if (AUTH_MODE==='header') h[AUTH_HEADER]=AUTH_TOKEN; if (AUTH_MODE==='basic') h['Authorization']=`Basic ${AUTH_TOKEN}`; return h; }
function sleep(ms: number): Promise<void> { return new Promise(r=>setTimeout(r,ms)); }

const headers = baseHeaders();
const paths = (process.env['PROBE_PATHS'] ?? '/,/status,/health').split(',').map(s=>s.trim()).filter(Boolean);

async function get(p: string){
  const u = url(p);
  const start = Date.now();
  try { const res = await fetch(u, { method: 'GET', headers } as any); const ms = Date.now()-start; return { path: p, url: u, status: res.status, allow: res.headers.get('allow'), ms }; }
  catch (err) { return { path: p, url: u, error: String(err) }; }
}

async function main(){
  const out: any[] = [];
  for (let i=0;i<paths.length;i++){
    const p = paths[i]!; const r = await get(p); out.push(r); if (i<paths.length-1) await sleep(DELAY);
  }
  console.log(JSON.stringify({ base: BASE, delayMs: DELAY, results: out, timestamp: new Date().toISOString() }, null, 2));
}

main().catch((e)=>{ console.error(e); process.exit(1); });

