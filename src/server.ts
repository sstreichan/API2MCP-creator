import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from 'node:fs';
import path from 'node:path';
import { qs } from "./lib/qs.js";
import { retry } from "./lib/retry.js";
import { logRequest, time } from "./lib/logger.js";

const API_BASE = process.env["API_BASE"] ?? "";
const AUTH_MODE = (process.env["AUTH_MODE"] ?? "none").toLowerCase();
const AUTH_TOKEN = process.env["AUTH_TOKEN"] ?? "";
const AUTH_HEADER = process.env["AUTH_HEADER"] ?? "Authorization";
const AUTH_QUERY_KEY = process.env["AUTH_QUERY_KEY"] ?? "api_key";
const ALLOW_DESTRUCTIVE = process.env["ALLOW_DESTRUCTIVE"] ?? "false";

if (!API_BASE) {
  console.error("[any-api-mcp] Missing API_BASE env");
  process.exit(1);
}

function isAbsoluteUrl(p: string): boolean { return /^https?:\/\//i.test(p); }
function joinUrl(base: string, path: string): string {
  if (isAbsoluteUrl(path)) return path;
  const lhs = base.endsWith("/") ? base.slice(0, -1) : base;
  const rhs = path.startsWith("/") ? path : `/${path}`;
  return `${lhs}${rhs}`;
}

function applyAuth(u: string, headers: Record<string, string>): string {
  switch (AUTH_MODE) {
    case "none": break;
    case "bearer": headers["Authorization"] = `Bearer ${AUTH_TOKEN}`; break;
    case "header": headers[AUTH_HEADER] = AUTH_TOKEN; break;
    case "basic": headers["Authorization"] = `Basic ${AUTH_TOKEN}`; break;
    case "query": {
      try {
        const url = new URL(u);
        url.searchParams.set(AUTH_QUERY_KEY, AUTH_TOKEN);
        return url.toString();
      } catch { return u + (u.includes("?") ? "&" : "?") + `${AUTH_QUERY_KEY}=${encodeURIComponent(AUTH_TOKEN)}`; }
    }
    default: break;
  }
  return u;
}

function parseRetryAfter(v: string | null): number | undefined {
  if (!v) return undefined; const secs = Number(v);
  if (Number.isFinite(secs)) return secs * 1000;
  const ts = Date.parse(v); if (Number.isFinite(ts)) { const d = ts - Date.now(); return d > 0 ? d : undefined; }
  return undefined;
}

class HttpError extends Error { constructor(public status: number, public excerpt: string, public retryAfterMs?: number) { super(`HTTP ${status}: ${excerpt}`);} }

async function hx<T=unknown>(path: string, init: { method?: string; headers?: Record<string,string>; body?: string; tool: string }): Promise<{ data: T; status: number; url: string }>{
  const method = (init.method ?? "GET").toUpperCase();
  const headers: Record<string,string> = { "Content-Type": "application/json", ...(init.headers ?? {}) };
  let url = joinUrl(API_BASE, path);
  url = applyAuth(url, headers);
  const start = time.start();

  const doFetch = async (): Promise<{ data: T; status: number; retryAfter?: number }> => {
    const res = await fetch(url, { method, headers, body: init.body } as any);
    const status = res.status;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const excerpt = text.slice(0, 200);
      const ra = parseRetryAfter(res.headers.get("retry-after"));
      throw new HttpError(status, excerpt, ra);
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data = (await res.json()) as T;
      return { data, status };
    } else {
      const text = await res.text().catch(() => "");
      return { data: (text ? (JSON.parse(text) as T) : undefined as any), status };
    }
  };

  try {
    if (method === "GET") {
      const { data, status } = await retry(doFetch, {
        attempts: 3, minDelayMs: 300, factor: 2,
        shouldRetry: (err) => err instanceof HttpError && [429,502,503,504].includes(err.status),
        retryAfterMs: (err) => (err as any)?.retryAfterMs
      });
      logRequest({ tool: init.tool, method, url, status, ms: time.end(start) });
      return { data, status, url };
    } else {
      const { data, status } = await doFetch();
      logRequest({ tool: init.tool, method, url, status, ms: time.end(start) });
      return { data, status, url };
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : undefined;
    logRequest({ tool: init.tool, method, url, status, ms: time.end(start) });
    throw err;
  }
}

// Zod inputs
const ProbeInput = z.object({ path: z.string(), method: z.string().default("GET"), headers: z.record(z.string(), z.string()).optional(), max_bytes: z.number().int().positive().default(4096) });
const GetInput = z.object({ path: z.string(), query: z.record(z.unknown()).optional(), headers: z.record(z.string(), z.string()).optional() });
const WriteInput = z.object({ path: z.string(), payload: z.unknown().optional(), headers: z.record(z.string(), z.string()).optional() });

const server = new McpServer({ name: "any-api-mcp", version: "0.1.0" });

server.tool("api_probe", "Probe an API path with any method (safe).", ProbeInput.shape, async (input) => {
  const qp = input.method.toUpperCase() === "GET" ? "" : ""; // no query support here, use api_get for GET+query
  const urlPath = `${input.path}${qp}`;
  const { status, url } = await hx(urlPath, { method: input.method, tool: "api_probe", headers: input.headers });
  // fetch body separately with GET to preview where appropriate
  let preview = ""; let ct = ""; let bytes = 0;
  try {
    const u = joinUrl(API_BASE, urlPath); const headers: Record<string,string> = { "Content-Type": "application/json", ...(input.headers ?? {}) };
    const u2 = applyAuth(u, headers);
    const res = await fetch(u2, { method: input.method, headers } as any);
    ct = res.headers.get("content-type") || "";
    const buf = await res.arrayBuffer(); bytes = buf.byteLength; const slice = buf.slice(0, Math.min(input.max_bytes, buf.byteLength));
    try { preview = new TextDecoder().decode(slice); } catch { preview = "<non-text response>"; }
  } catch {}
  const payload = { url, status, contentType: ct, bytes, preview };
  return { content: [{ type: "resource", resource: { uri: url, mimeType: "application/json", text: JSON.stringify(payload) } }] };
});

server.tool("api_get", "Generic GET against API_BASE (safe).", GetInput.shape, async (input) => {
  const pathWithQuery = `${input.path}${qs(input.query)}`;
  const { data, url } = await hx<Record<string, unknown>>(pathWithQuery, { method: "GET", tool: "api_get", headers: input.headers });
  return { content: [{ type: "resource", resource: { uri: url, mimeType: "application/json", text: JSON.stringify(data) } }] };
});

server.tool("api_post", "Generic POST against API_BASE (guarded).", WriteInput.shape, async (input) => {
  if (ALLOW_DESTRUCTIVE !== "true") return { content: [{ type: "text", text: "Destructive disabled. Set ALLOW_DESTRUCTIVE=true to enable POST." }] };
  const body = typeof input.payload === "undefined" ? undefined : JSON.stringify(input.payload);
  const { data, url } = await hx<Record<string, unknown>>(input.path, { method: "POST", tool: "api_post", headers: input.headers, body });
  return { content: [{ type: "resource", resource: { uri: url, mimeType: "application/json", text: JSON.stringify(data) } }] };
});

server.tool("api_put", "Generic PUT against API_BASE (guarded).", WriteInput.shape, async (input) => {
  if (ALLOW_DESTRUCTIVE !== "true") return { content: [{ type: "text", text: "Destructive disabled. Set ALLOW_DESTRUCTIVE=true to enable PUT." }] };
  const body = typeof input.payload === "undefined" ? undefined : JSON.stringify(input.payload);
  const { data, url } = await hx<Record<string, unknown>>(input.path, { method: "PUT", tool: "api_put", headers: input.headers, body });
  return { content: [{ type: "resource", resource: { uri: url, mimeType: "application/json", text: JSON.stringify(data) } }] };
});

server.tool("api_delete", "Generic DELETE against API_BASE (guarded).", WriteInput.shape, async (input) => {
  if (ALLOW_DESTRUCTIVE !== "true") return { content: [{ type: "text", text: "Destructive disabled. Set ALLOW_DESTRUCTIVE=true to enable DELETE." }] };
  const body = typeof input.payload === "undefined" ? undefined : JSON.stringify(input.payload);
  const { data, url } = await hx<Record<string, unknown>>(input.path, { method: "DELETE", tool: "api_delete", headers: input.headers, body });
  return { content: [{ type: "resource", resource: { uri: url, mimeType: "application/json", text: JSON.stringify(data ?? {}) } }] };
});

await server.connect(new StdioServerTransport());

// Dynamic tool registration from tools.json if present
try {
  const toolsFile = process.env['TOOLS_FILE'] ?? 'tools.json';
  const p = path.resolve(process.cwd(), toolsFile);
  if (fs.existsSync(p)) {
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    const list: any[] = cfg.tools ?? [];
    for (const t of list) {
      const name = String(t.name);
      const description = String(t.description ?? `${t.method} ${t.pathTemplate}`);
      const method = String(t.method ?? 'GET').toUpperCase();
      const guarded = Boolean(t.guarded ?? (method !== 'GET'));
      const pathTemplate = String(t.pathTemplate);
      const Input = z.object({
        pathParams: z.record(z.string()).optional(),
        query: z.record(z.unknown()).optional(),
        payload: z.unknown().optional(),
        headers: z.record(z.string(), z.string()).optional()
      });
      server.tool(name, description, Input.shape, async (input:any)=>{
        const compiledPath = pathTemplate.replace(/\{(.*?)\}/g, (_:string, k: string) => encodeURIComponent(String(input.pathParams?.[k] ?? '')));
        const withQuery = method === 'GET' ? `${compiledPath}${qs(input.query)}` : compiledPath;
        if (guarded && ALLOW_DESTRUCTIVE !== 'true') return { content: [{ type: 'text', text: 'Destructive disabled. Set ALLOW_DESTRUCTIVE=true to enable.' }] };
        const body = typeof input.payload === 'undefined' ? undefined : JSON.stringify(input.payload);
        const { data, url } = await hx<Record<string, unknown>>(withQuery, { method, tool: name, headers: input.headers, body });
        return { content: [{ type: 'resource', resource: { uri: url, mimeType: 'application/json', text: JSON.stringify(data) } }] };
      });
    }
  }
} catch {}
