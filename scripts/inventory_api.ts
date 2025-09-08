/*
 Inventory an API: try OpenAPI discovery, else scan a wordlist via OPTIONS.
 Env: API_BASE, AUTH_*, OUTPUT_DIR (default reports/), PROBE_DELAY_MS, WORDLIST
*/
import { loadLocalEnv } from './_load_env.js';
loadLocalEnv();

const BASE = process.env['API_BASE'] ?? '';
const OUTPUT_DIR = process.env['OUTPUT_DIR'] ?? 'reports';
const DELAY = Number(process.env['PROBE_DELAY_MS'] ?? '800');

if (!BASE) { console.error('Missing API_BASE'); process.exit(1); }

async function run(cmd: string, env: Record<string,string>): Promise<string> {
  const { spawn } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    const [bin, ...args] = cmd.split(/\s+/);
    const p = spawn(bin, args, { stdio: ['ignore','pipe','pipe'], env: { ...process.env, ...env } });
    let out = ''; let err='';
    p.stdout.on('data', (d)=> out += d.toString());
    p.stderr.on('data', (d)=> err += d.toString());
    p.on('close', (code)=> code === 0 ? resolve(out.trim()) : reject(new Error(err || `exit ${code}`)));
  });
}

async function main(){
  const ts = Date.now();
  // 1) Try OpenAPI
  const openapiOut = await run(`npx tsx scripts/discover_openapi.ts`, { OUTPUT: `${OUTPUT_DIR}/openapi_${ts}.json`, PROBE_DELAY_MS: String(DELAY) }).catch(()=>"");
  let usedOpenapi = false;
  if (openapiOut && openapiOut.includes(`${OUTPUT_DIR}/openapi_`)) {
    usedOpenapi = true;
    console.log(openapiOut);
  }
  // 2) If not discovered, scan wordlist
  if (!usedOpenapi) {
    const wlOut = await run(`npx tsx scripts/scan_wordlist.ts`, { OUTPUT: `${OUTPUT_DIR}/wordlist_${ts}.json`, PROBE_DELAY_MS: String(DELAY) }).catch((e)=>String(e));
    console.log(typeof wlOut === 'string' ? wlOut : '');
  }
}

main().catch((e)=>{ console.error(e); process.exit(1); });

