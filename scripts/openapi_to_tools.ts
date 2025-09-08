/*
 Convert an OpenAPI JSON file to tools.json for dynamic tool registration.
 Env: OPENAPI_FILE (required), TOOLS_FILE (default tools.json)
*/
import fs from 'node:fs';
import path from 'node:path';

const OPENAPI_FILE = process.env['OPENAPI_FILE'] ?? '';
const TOOLS_FILE = process.env['TOOLS_FILE'] ?? 'tools.json';

if (!OPENAPI_FILE) { console.error('Missing OPENAPI_FILE'); process.exit(1); }

function loadJson(p: string): any { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function normalizeName(method: string, p: string): string {
  const segs = p.replace(/\{.*?\}/g, 'by').split('/').filter(Boolean).slice(-2);
  const base = segs.join('_').replace(/[^a-zA-Z0-9_]/g, '_');
  return `${method.toLowerCase()}_${base || 'root'}`;
}

function buildTools(spec: any): any[] {
  const tools: any[] = [];
  const paths = spec.paths || {};
  for (const [p, methods] of Object.entries<any>(paths)) {
    for (const [m, def] of Object.entries<any>(methods)) {
      const method = m.toUpperCase();
      if (!['GET','POST','PUT','DELETE','PATCH'].includes(method)) continue;
      const name = (def.operationId && typeof def.operationId === 'string') ? def.operationId : normalizeName(method, p);
      const desc = def.summary || def.description || `${method} ${p}`;
      const params = Array.isArray(def.parameters) ? def.parameters : [];
      const pathParams = params.filter((x:any)=>x.in==='path').map((x:any)=>x.name);
      const queryParams = params.filter((x:any)=>x.in==='query').map((x:any)=>x.name);
      const hasBody = !!def.requestBody;
      tools.push({ name, description: desc, method, pathTemplate: p, pathParams, queryParams, hasBody, guarded: method !== 'GET' });
    }
  }
  return tools;
}

function main(){
  const spec = loadJson(path.resolve(process.cwd(), OPENAPI_FILE));
  const tools = buildTools(spec);
  const output = { generatedAt: new Date().toISOString(), tools };
  fs.writeFileSync(path.resolve(process.cwd(), TOOLS_FILE), JSON.stringify(output, null, 2));
  console.log(TOOLS_FILE);
}

main();

