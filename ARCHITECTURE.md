# Architecture

## Pattern Overview

**Overall:** Generic HTTP API Adapter for MCP

**Key Characteristics:**
- Converts any HTTP API into typed MCP tools dynamically
- Multi-auth support (none, bearer, header, basic, query)
- Safe vs guarded access pattern (GET/OPTIONS safe, POST/PUT/DELETE guarded)
- Runtime discovery via OpenAPI or wordlist scans
- Real-time retry with `Retry-After` header support
- Typed input validation with Zod
- Output redaction for secrets in logs

## Layers

src/server.ts:
- Purpose: MCP entrypoint registering core tools and dynamic tools
- Location: `src/server.ts`
- Contains: Core HTTP handler functions, tool registration, env parsing
- Depends on: `@modelcontextprotocol/sdk`, `zod`, `qs`, `retry`, `logger`
- Used by: MCP clients via stdio transport

src/lib/qs.ts:
- Purpose: Query string serialization with null/undefined filtering
- Location: `src/lib/qs.ts`
- Contains: qs() function for building URL search params
- Depends on: none
- Used by: server.ts for GET requests with query params

src/lib/retry.ts:
- Purpose: Exponential backoff retry with jitter and `Retry-After` support
- Location: `src/lib/retry.ts`
- Contains: sleep(), retry() utility with configurable behavior
- Depends on: none
- Used by: server.ts for safe GET requests

src/lib/logger.ts:
- Purpose: JSON structured logging to stderr with URL token redaction
- Location: `src/lib/logger.ts`
- Contains: logRequest(), time utilities, redact() function
- Depends on: none
- Used by: server.ts for all request logging

scripts/*.ts:
- Purpose: API discovery, validation, and automation scripts
- Location: `scripts/`
- Contains: OpenAPI discovery, wordlist scanning, OAuth2 helpers, endpoint validation
- Depends on: `@modelcontextprotocol/sdk`, `zod`, filesystem
- Used by: developers for API onboarding

internal/*:
- Purpose: Internal utilities and extensions
- Location: `internal/`
- Contains: HTTPX client, CLI tools, config management
- Depends on: Node.js modules, third-party libraries
- Used by: internal tooling and server extensions

## Data Flow

**Transform Pipeline:** (api_probe execution)

1. Client sends JSON-RPC to MCP server — `src/server.ts`
2. Zod validates input parameters — `src/server.ts`
3. HTTP request is made via hx() function — `src/server.ts`
4. Response is logged and returned as MCP resource — `src/server.ts`
5. Server sends response back over stdio

## Key Abstractions

**HttpError:**
- Purpose: Structured HTTP error with status, excerpt, and retry delay
- Location: `src/server.ts`
- Pattern: Custom Error subclass with typed fields

**hx():**
- Purpose: Unified HTTP request function with auth and error handling
- Location: `src/server.ts`
- Pattern: Wrapper around fetch with auth, retry, logging

**applyAuth():**
- Purpose: Apply authentication headers/query to URLs based on auth mode
- Location: `src/server.ts`
- Pattern: Strategy pattern based on AUTH_MODE env var

## Entry Points

**MCP Server (stdio):**
- Location: `src/server.ts`
- Triggers: MCP client connecting over stdio
- Responsibilities: Parses env vars, registers tools, processes requests

**CLI Scripts:**
- Location: `scripts/` directory
- Triggers: `npm run <script>` commands
- Responsibilities: API discovery, validation, and automation

## Error Handling

**Strategy:** Fail closed with structured error propagation

- HTTP errors create HttpError with status, excerpt, and optional retry delay
- Errors are propagated up to server.tool() handlers
- MCP SDK converts them to JSON-RPC error responses
- Logging failures are swallowed to prevent breaking request flow
- Retry logic breaks on non-retryable errors

## Cross-Cutting Concerns

**Logging:**
- Approach: JSON structured logs to stderr with automatic redaction of URL tokens, secrets, passwords
- Location: src/lib/logger.ts
- Redaction patterns: keys matching /key|token|secret|password/i in query params

**Caching:**
- Approach: No built-in caching; relies on HTTP API caching headers
- Note: Scripts accept PROBE_DELAY_MS for pacing

**Storage:**
- Approach: In-memory only; tools.json file for dynamic tool registration
- Reports directory for discovery outputs via scripts