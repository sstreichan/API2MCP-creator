/*
 Validate endpoints via GET/OPTIONS with pacing. Env: API_BASE, AUTH_*.
*/
import { loadLocalEnv } from './_load_env.js';
loadLocalEnv();

type Method = 'GET'|'POST'|'PUT'|'DELETE'|'OPTIONS'|'HEAD';

const BASE = process.env['API_BASE'] ?? '';
const AUTH_MODE = (process.env['AUTH_MODE'] ?? 'none').toLowerCase();
const AUTH_TOKEN = process.env['AUTH_TOKEN'] ?? '';
const AUTH_HEADER = process.env['AUTH_HEADER'] ?? 'Authorization';
const AUTH_QUERY_KEY = process.env['AUTH_QUERY_KEY'] ?? 'api_key';
const BASE_DELAY = Number(process.env['PROBE_DELAY_MS'] ?? '1000');

if (!BASE) { console.error('Missing API_BASE'); process.exit(1); }

function url(p: string): string { const b = BASE.endsWith('/') ? BASE.slice(0,-1) : BASE; const path = p.startsWith('/') ? p : `/${p}`; const u = `${b}${path}`; return applyAuth(u); }
function applyAuth(u: string): string {
  if (AUTH_MODE === 'bearer') return addHeader(u); if (AUTH_MODE === 'header') return addHeader(u); if (AUTH_MODE === 'basic') return addHeader(u);
  if (AUTH_MODE === 'query') return addQuery(u); return u;
}
function addHeader(u: string): string { return u; }
function addQuery(u: string): string { try { const x = new URL(u); x.searchParams.set(AUTH_QUERY_KEY, AUTH_TOKEN); return x.toString(); } catch { return u + (u.includes('?')?'&':'?') + `${AUTH_QUERY_KEY}=${encodeURIComponent(AUTH_TOKEN)}`; } }

function baseHeaders(): Record<string,string> {
  const h: Record<string,string> = { 'Content-Type': 'application/json' };
  if (AUTH_MODE === 'bearer') h['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  if (AUTH_MODE === 'header') h[AUTH_HEADER] = AUTH_TOKEN;
  if (AUTH_MODE === 'basic') h['Authorization'] = `Basic ${AUTH_TOKEN}`;
  return h;
}

function parseRetryAfter(v: string | null): number | undefined { if (!v) return; const s = Number(v); if (Number.isFinite(s)) return s*1000; const ts = Date.parse(v); if (Number.isFinite(ts)) { const d=ts-Date.now(); return d>0?d:undefined;} }
function sleep(ms: number): Promise<void> { return new Promise(r=>setTimeout(r,ms)); }

const headers = baseHeaders();

const endpoints = [
  { path: '/', methods: ['GET'] as Method[] },
  { path: '/status', methods: ['GET'] as Method[] },
  { path: '/health', methods: ['GET'] as Method[] }
];

async function probe(method: Method, p: string): Promise<{ status: number; allow?: string|null; retryAfter?: number }>{
  const u = url(p); const res = await fetch(u, { method, headers } as any); return { status: res.status, allow: res.headers.get('allow'), retryAfter: parseRetryAfter(res.headers.get('retry-after')) };
}

async function main(){
  const results: any[] = [];
  let nextReady = Date.now();
  let delay = BASE_DELAY; const MAX_DELAY = 15000; const MIN_DELAY = Math.max(300, BASE_DELAY);
  for (const e of endpoints){
    const r: any = { path: e.path, checks: [] };
    for (const m of e.methods){
      const methodToUse: Method = m === 'GET' ? 'GET' : (m==='POST'||m==='PUT'||m==='DELETE') ? 'OPTIONS' : m;
      const now = Date.now(); if (now<nextReady) await sleep(nextReady-now);
      try {
        const { status, allow, retryAfter } = await probe(methodToUse, e.path);
        if (status===429) {
          if (typeof retryAfter==='number') { delay = Math.min(MAX_DELAY, retryAfter); }
          else { delay = Math.min(MAX_DELAY, Math.floor(delay * 1.8)); }
          nextReady = Date.now()+delay;
        } else {
          delay = Math.max(MIN_DELAY, Math.floor(delay * 0.9));
          nextReady = Date.now()+delay;
        }
        r.checks.push({ method: m, probedWith: methodToUse, status, allow });
      } catch (err) {
        r.checks.push({ method: m, error: String(err) });
      }
    }
    results.push(r);
  }
  console.log(JSON.stringify({ base: BASE, results, timestamp: new Date().toISOString() }, null, 2));
}

main().catch((e)=>{ console.error(e); process.exit(1); });
