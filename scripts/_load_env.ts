import fs from 'node:fs';
import path from 'node:path';

export function loadLocalEnv(filename = '.env.local'): void {
  try {
    const p = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(p)) return;
    const text = fs.readFileSync(p, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {}
}

