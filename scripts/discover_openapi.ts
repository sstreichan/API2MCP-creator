/*
 Discover OpenAPI/Swagger docs and enumerate endpoints.
 Env: API_BASE, AUTH_*, OUTPUT (optional path), PROBE_DELAY_MS (default 800)
*/
import { loadLocalEnv } from './_load_env.js';
loadLocalEnv();

const BASE = process.env['API_BASE'] ?? '';
const AUTH_MODE = (process.env['AUTH_MODE'] ?? 'none').toLowerCase();
const AUTH_TOKEN = process.env['AUTH_TOKEN'] ?? '';
const AUTH_HEADER = process.env['AUTH_HEADER'] ?? 'Authorization';
const AUTH_QUERY_KEY = process.env['AUTH_QUERY_KEY'] ?? 'api_key';
const OUTPUT = process.env['OUTPUT'] ?? '';
const DELAY = Number(process.env['PROBE_DELAY_MS'] ?? '800');

if (!BASE) { console.error('Missing API_BASE'); process.exit(1); }

function sleep(ms: number){ return new Promise(r=>setTimeout(r,ms)); }
function parseRetryAfter(v: string | null): number | undefined { if (!v) return; const s = Number(v); if (Number.isFinite(s)) return s*1000; const ts = Date.parse(v); if (Number.isFinite(ts)) { const d=ts-Date.now(); return d>0?d:undefined; } }

function joinUrl(base: string, path: string){ const b = base.endsWith('/')? base.slice(0,-1): base; const p = path.startsWith('/')? path: `/${path}`; return `${b}${p}`; }
function applyAuth(u: string, headers: Record<string,string>): string {
  switch (AUTH_MODE) {
    case 'bearer': headers['Authorization'] = `Bearer ${AUTH_TOKEN}`; break;
    case 'header': headers[AUTH_HEADER] = AUTH_TOKEN; break;
    case 'basic': headers['Authorization'] = `Basic ${AUTH_TOKEN}`; break;
    case 'query': {
      try { const x = new URL(u); x.searchParams.set(AUTH_QUERY_KEY, AUTH_TOKEN); return x.toString(); } catch { return u + (u.includes('?')?'&':'?') + `${AUTH_QUERY_KEY}=${encodeURIComponent(AUTH_TOKEN)}`; }
    }
    default: break;
  }
  return u;
}

const candidates = [
  '/openapi.json','/openapi.yaml','/openapi.yml',
  '/v3/api-docs','/v3/api-docs.yaml','/v3/openapi.json',
  '/swagger.json','/swagger/v1/swagger.json',
  '/.well-known/openapi.json','/api-docs','/docs/openapi.json'
];

async function fetchText(u: string): Promise<{ status: number; text?: string; ct?: string; retryAfter?: number }>{
  const headers: Record<string,string> = { 'Accept': 'application/json, application/yaml, text/yaml, text/plain' };
  const url = applyAuth(u, headers);
  const res = await fetch(url, { method: 'GET', headers } as any);
  const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
  if (!res.ok) return { status: res.status, retryAfter };
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  return { status: res.status, text, ct, retryAfter };
}

function parseSpec(text: string, ct?: string): any | undefined {
  try { return JSON.parse(text); } catch {}
  // naive YAML support
  if (ct && /yaml|yml/.test(ct)) return undefined;
  return undefined;
}

function listPaths(spec: any): { path: string; methods: string[] }[] {
  const out: { path: string; methods: string[] }[] = [];
  if (!spec || !spec.paths || typeof spec.paths !== 'object') return out;
  for (const [p, methods] of Object.entries<any>(spec.paths)) {
    const ms = Object.keys(methods).map(s=>s.toUpperCase());
    out.push({ path: String(p), methods: ms });
  }
  return out;
}

async function main(){
  let nextReady = Date.now();
  const tried: any[] = [];
  for (const c of candidates){
    const now = Date.now(); if (now<nextReady) await sleep(nextReady-now);
    const u = joinUrl(BASE, c);
    const r = await fetchText(u);
    tried.push({ candidate: c, status: r.status });
    if (r.status === 429 && typeof r.retryAfter === 'number') { nextReady = Date.now()+r.retryAfter; continue; }
    nextReady = Date.now()+DELAY;
    if (r.status >= 200 && r.status < 300 && r.text){
      const spec = parseSpec(r.text, r.ct);
      if (spec){
        const endpoints = listPaths(spec);
        const report = { base: BASE, discovered: c, endpoints, rawSpec: spec, timestamp: new Date().toISOString() };
        if (OUTPUT){
          const fs = await import('node:fs'); const path = await import('node:path'); const p = path.resolve(process.cwd(), OUTPUT);
          // @ts-ignore
          fs.mkdirSync(path.dirname(p), { recursive: true });
          fs.writeFileSync(p, JSON.stringify(report, null, 2));
          console.log(p);
        } else {
          console.log(JSON.stringify(report, null, 2));
        }
        return;
      }
    }
  }
  console.log(JSON.stringify({ base: BASE, discovered: null, tried, timestamp: new Date().toISOString() }, null, 2));
}

main().catch((e)=>{ console.error(e); process.exit(1); });

