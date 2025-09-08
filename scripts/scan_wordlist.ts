/*
 Scan endpoints using a wordlist with OPTIONS (safe). Env: API_BASE, AUTH_*, WORDLIST (path, optional), OUTPUT (path, optional), PROBE_DELAY_MS (default 800)
*/
import { loadLocalEnv } from './_load_env.js';
loadLocalEnv();

import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env['API_BASE'] ?? '';
const AUTH_MODE = (process.env['AUTH_MODE'] ?? 'none').toLowerCase();
const AUTH_TOKEN = process.env['AUTH_TOKEN'] ?? '';
const AUTH_HEADER = process.env['AUTH_HEADER'] ?? 'Authorization';
const AUTH_QUERY_KEY = process.env['AUTH_QUERY_KEY'] ?? 'api_key';
const WORDLIST = process.env['WORDLIST'] ?? '';
const OUTPUT = process.env['OUTPUT'] ?? '';
const BASE_DELAY = Number(process.env['PROBE_DELAY_MS'] ?? '800');

if (!BASE) { console.error('Missing API_BASE'); process.exit(1); }

function sleep(ms: number){ return new Promise(r=>setTimeout(r,ms)); }
function parseRetryAfter(v: string | null): number | undefined { if (!v) return; const s = Number(v); if (Number.isFinite(s)) return s*1000; const ts = Date.parse(v); if (Number.isFinite(ts)) { const d=ts-Date.now(); return d>0?d:undefined; } }

function joinUrl(base: string, path0: string){ const b = base.endsWith('/')? base.slice(0,-1): base; const p = path0.startsWith('/')? path0: `/${path0}`; return `${b}${p}`; }
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

function loadWords(): string[] {
  const defaults = `
status
health
docs
openapi
users
user
accounts
devices
policies
apps
orders
products
search
auth
login
logout
metrics
info
v1
v2
`; // small, non-aggressive default
  if (!WORDLIST) return defaults.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const p = path.resolve(process.cwd(), WORDLIST);
  if (!fs.existsSync(p)) return [];
  const text = fs.readFileSync(p, 'utf8');
  return text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
}

async function probeOptions(p: string): Promise<{ status: number; allow?: string | null; retryAfter?: number }>{
  const headers: Record<string,string> = { 'Content-Type': 'application/json' };
  const u0 = joinUrl(BASE, p);
  const u = applyAuth(u0, headers);
  const res = await fetch(u, { method: 'OPTIONS', headers } as any);
  return { status: res.status, allow: res.headers.get('allow'), retryAfter: parseRetryAfter(res.headers.get('retry-after')) };
}

async function main(){
  const words = loadWords();
  const results: any[] = [];
  let nextReady = Date.now(); let delay = BASE_DELAY; const MAX_DELAY = 20000; const MIN_DELAY = Math.max(300, BASE_DELAY);
  for (const w of words){
    const now = Date.now(); if (now<nextReady) await sleep(nextReady-now);
    const path1 = `/${w}`;
    const r = await probeOptions(path1).catch(()=>({ status: -1 } as any));
    if (r.status === 429) {
      if (typeof r.retryAfter === 'number') delay = Math.min(MAX_DELAY, r.retryAfter); else delay = Math.min(MAX_DELAY, Math.floor(delay*1.8));
      nextReady = Date.now()+delay;
    } else { delay = Math.max(MIN_DELAY, Math.floor(delay*0.9)); nextReady = Date.now()+delay; }
    results.push({ path: path1, options: r.status, allow: r.allow });
    // also try with trailing slash
    if (Date.now()<nextReady) await sleep(nextReady-Date.now());
    const path2 = `/${w}/`;
    const r2 = await probeOptions(path2).catch(()=>({ status: -1 } as any));
    if (r2.status === 429) {
      if (typeof r2.retryAfter === 'number') delay = Math.min(MAX_DELAY, r2.retryAfter); else delay = Math.min(MAX_DELAY, Math.floor(delay*1.8));
      nextReady = Date.now()+delay;
    } else { delay = Math.max(MIN_DELAY, Math.floor(delay*0.9)); nextReady = Date.now()+delay; }
    results.push({ path: path2, options: r2.status, allow: r2.allow });
  }
  const report = { base: BASE, count: results.length, results, timestamp: new Date().toISOString() };
  if (OUTPUT){
    const p = path.resolve(process.cwd(), OUTPUT);
    // @ts-ignore
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(report, null, 2));
    console.log(p);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

main().catch((e)=>{ console.error(e); process.exit(1); });
