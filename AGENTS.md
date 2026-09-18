# AGENTS.md — any-api-mcp

A generic, configurable Model Context Protocol (MCP) server for adapting any HTTP API into an MCP toolset. Built on TypeScript (strict), Node.js ≥20, ESM, the official `@modelcontextprotocol/sdk`, and `zod` for input validation.

## Repository Layout

| Path | Responsibility |
|---|---|
| `src/server.ts` | MCP entrypoint — registers tools, connects to `StdioServerTransport`, loads `.env.local`, registers dynamic tools from `tools.json` |
| `src/lib/qs.ts` | Query string serializer (filters null/undefined/empty values, returns `""` or `?…`) |
| `src/lib/retry.ts` | Exponential backoff retry with jitter; honours `Retry-After` header via callback |
| `src/lib/logger.ts` | STDERR JSON logger with URL token/secret redaction |
| `scripts/_load_env.ts` | Minimal `.env.local` loader (does not override existing `process.env`) |
| `scripts/*.ts` | Discovery & verification CLI scripts (openapi discovery, wordlist scan, endpoint probe, oauth2 helpers) |
| `test/server.smoke.test.ts` | Spawns server over real stdio transport, sends JSON-RPC `tools/list`, asserts 5 core tools registered |
| `examples/hexnode.tools.json` | Sample `tools.json` for Hexnode API (dynamic tool registration format) |
| `dist/` | Compiled output from `tsc` — **never edit manually** |
| `.github/workflows/ci.yml` | CI: `npm ci` → `npm run build` → `npm test` |
| `plan.md` | Migration plan to Go (not yet implemented) |

## Build, Lint & Test

### Install
```bash
npm ci
```

### Build
```bash
npm run build       # tsc -p tsconfig.json → dist/
```

### Dev (watches & runs server.ts via tsx)
```bash
npm run dev
```

### Tests
```bash
npm test                              # runs the single smoke test
npx tsx --test test/server.smoke.test.ts   # explicit single-file invocation
npx tsx --test path/to/specific.test.ts    # add more files under test/ as they appear
```
> The test spawns the server as a child process over its real stdio transport. It cannot be safely `import`-ed in-process because `server.ts` calls `server.connect()` at top level (side effect).

### Lint / Type-check
No linter or formatter is configured. The only validation gate is the TypeScript compiler:
```bash
npm run build          # type-checks + emits to dist/
npx tsc --noEmit       # type-check only, no output
```
**If you add a linter (eslint/prettier), update this file.** Until then, enforce style manually (see §3).

### CI
```bash
# Replicates GitHub Actions
npm ci && npm run build && npm test
```

## Code Style

### Runtime / Compiler
- **Node ≥20.0.0** (see `package.json` engines)
- **TypeScript 5.6+** with `"strict": true`, `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`
- **ESM** only (`"type": "module"`); use `.js` extension in relative imports (e.g. `import { qs } from "./lib/qs.js"`)
- **`tsx`** (not `ts-node`) for running TS directly in scripts and tests

### Formatting
- **Indentation**: 2 spaces
- **Strings**: double quotes in `src/` (e.g. `process.env["API_BASE"]`); single quotes in `scripts/` — match the file you're in
- **Semicolons**: none at end of statements (ASI); use them only when needed to prevent ambiguity
- **Line length**: keep reasonable; no hard limit enforced
- **Trailing commas**: used in multiline lists/objects (e.g. `z.object({ … })`)
- **Imports**: `node:` protocol for built-ins (e.g. `import fs from "node:fs"`)
- **No default exports** — all current modules use named exports

### Types
- Use **explicit types** (`Record<string, string>`, `z.record(z.string(), z.string())`) rather than `any`
- `any` is tolerated only when interfacing with untyped fetch/stdlib (`{ method, headers, body } as any`) — avoid adding new ones
- Zod schemas define input shapes; pass `.shape` to `server.tool()` (critical — passing the schema object directly breaks compilation)
- Generics: `async function hx<T = unknown>(…)` — prefer `unknown` over `any` for untyped responses

### Naming
| Kind | Convention |
|---|---|
| Files | kebab-case or lowercase (`qs.ts`, `server.ts`, `validate_endpoints.ts`) |
| Functions | `camelCase` (`joinUrl`, `applyAuth`, `parseRetryAfter`) |
| Variables | `camelCase` (`API_BASE` for env-derived constants) |
| Constants (env) | `UPPER_SNAKE_CASE` (`API_BASE`, `AUTH_MODE`, `ALLOW_DESTRUCTIVE`) |
| Classes | `PascalCase` (`HttpError`) |

### Error Handling
- Custom errors extend `Error` with typed public fields (e.g. `HttpError` has `status`, `excerpt`, `retryAfterMs`)
- Errors are **propagated** up to `server.tool()` handlers — the MCP SDK converts them to JSON-RPC error responses
- Logging failures are swallowed (`try { … } catch {}` in `logRequest`) to prevent log errors from breaking request flow
- Retry logic in `lib/retry.ts`: breaks on non-retryable errors, honours `shouldRetry` predicate, uses jittered exponential backoff, respects `Retry-After` override

### Async / Concurrency
- `fetch` with `async/await` throughout
- Top-level `await` used for `server.connect()` in `server.ts`
- Retry uses `sleep()` (Promise + `setTimeout`) — no AbortSignal wiring yet

## Repository Conventions

### Branch & Commit
- Default branch: `main`
- Commits observed: imperative, conventional style (`fix:`, `feat:`/`docs:`/`chore:`/`test:`/`ci:`)
- No formal branch naming enforced yet; use descriptive names for feature work
- **Do not commit** `.env`, `.env.*`, `dist/`, `reports/`, `node_modules/` (see `.gitignore`)

### Env Variables
- `.env.local` is auto-loaded by `scripts/_load_env.ts` (called at top of each script)
- The server itself (`src/server.ts`) reads `process.env` directly — **does not auto-load `.env.local`**. Set env vars before running the server, or via MCP client config.
- Never hardcode secrets; always source from env
- Secrets in URLs are redacted in logs via regex (`key|token|secret|password`): `lib/logger.ts:17`

### Key Env Vars
| Variable | Default | Description |
|---|---|---|
| `API_BASE` | (required) | Base URL for target API |
| `AUTH_MODE` | `none` | `none\|bearer\|header\|basic\|query` |
| `AUTH_TOKEN` | `""` | Token / credential value |
| `AUTH_HEADER` | `Authorization` | Header name (for `header` mode) |
| `AUTH_QUERY_KEY` | `api_key` | Query param name (for `query` mode) |
| `ALLOW_DESTRUCTIVE` | `false` | Gates all POST/PUT/DELETE tools |
| `TOOLS_FILE` | `tools.json` | Path to dynamic tool definitions |

### MCP Tool Naming
Core tools: `api_probe`, `api_get`, `api_post`, `api_put`, `api_delete`. Dynamic tools from `tools.json` use arbitrary names from the config.

## Agent-Specific Instructions

### Never modify
- `dist/**` — compiled output, regenerated by `npm run build`
- `node_modules/**` — managed by `npm ci`
- `package-lock.json` — only update via `npm install`
- `.env.local` or any `.env*` file — contains secrets; never commit
- `plan.md` — migration planning document (do not edit unless explicitly asked)
- Generated files starting with `// Code generated by go-swagger; DO NOT EDIT.` (check first line before editing any file)

### Auto-generated
- `dist/` is regenerated by `tsc`; edits are lost. Always edit `src/` and rebuild.

### When to ask vs. proceed
- **Ask**: changing public MCP tool names, schemas, or response formats (breaking contract for MCP clients)
- **Ask**: modifying auth/security behavior (redaction, retry rules, `ALLOW_DESTRUCTIVE` semantics)
- **Proceed autonomously**: bug fixes within a single module, new lib helpers, script improvements, test additions
- **Ambiguous requirements**: if an env var's precedence or default is unclear, check how `server.ts` and scripts differ — the server reads `process.env` at module load time and never re-reads; scripts load `.env.local` at script start

### Verification
After any change to `src/`:
```bash
npm run build && npm test
```
After adding/modifying a test file, run it directly:
```bash
npx tsx --test test/your_file.test.ts
```

### Key gotchas
- `server.ts` calls `server.connect()` at **top level** via top-level await — this is a side effect. Do not `import` it in tests; spawn it as a child process instead.
- `tools.json` dynamic tool registration happens **after** `server.connect()` — tools registered too late may not be visible to clients that fetch the list immediately on connect.
- The `as any` casts on `fetch` calls exist because Node's built-in `fetch` types are loose; do not add new `any` casts without justification.
- `lib/logger.ts` logs to **stderr** only — stdout is reserved for MCP JSON-RPC protocol over stdio transport. Never write to stdout outside the MCP SDK.
