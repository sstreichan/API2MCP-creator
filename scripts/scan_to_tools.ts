/*
 Convert a wordlist scan report to tools.json (GET/OPTIONS derived methods).
 Env: SCAN_FILE (required), TOOLS_FILE (default tools.json)
*/
import fs from 'node:fs';
import path from 'node:path';

const SCAN_FILE = process.env['SCAN_FILE'] ?? '';
const TOOLS_FILE = process.env['TOOLS_FILE'] ?? 'tools.json';

if (!SCAN_FILE) { console.error('Missing SCAN_FILE'); process.exit(1); }

function loadJson(p: string): any { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function normalizeName(method: string, p: string): string {
  const segs = p.replace(/\{.*?\}/g, 'by').split('/').filter(Boolean).slice(-2);
  const base = segs.join('_').replace(/[^a-zA-Z0-9_]/g, '_');
  return `${method.toLowerCase()}_${base || 'root'}`;
}

function methodsFromAllow(allow?: string | null): string[] {
  if (!allow) return ['GET'];
  const ms = allow.split(',').map(s=>s.trim().toUpperCase());
  const allowed = ['GET','POST','PUT','DELETE','PATCH'].filter(m=>ms.includes(m));
  return allowed.length ? allowed : ['GET'];
}

function main(){
  const scan = loadJson(path.resolve(process.cwd(), SCAN_FILE));
  const tools: any[] = [];
  const seen = new Set<string>();
  for (const r of scan.results as any[]) {
    const p = r.path as string;
    const allow = r.allow as string | undefined;
    const methods = methodsFromAllow(allow);
    for (const m of methods) {
      const name = normalizeName(m, p);
      const key = `${m} ${p}`;
      if (seen.has(key)) continue; seen.add(key);
      tools.push({ name, description: `${m} ${p}`, method: m, pathTemplate: p, pathParams: [], queryParams: [], hasBody: m!=='GET', guarded: m!=='GET' });
    }
  }
  const output = { generatedAt: new Date().toISOString(), tools };
  fs.writeFileSync(path.resolve(process.cwd(), TOOLS_FILE), JSON.stringify(output, null, 2));
  console.log(TOOLS_FILE);
}

main();

