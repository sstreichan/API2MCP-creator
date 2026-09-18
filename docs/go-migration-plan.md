# Go-Migrationsplan — API2MCP-creator (`any-api-mcp`)

- **Stand:** 2026-09-18
- **Prüfstand-Commit:** `2ea466aa2528c16c7525d71861f155ee728b8e36`
- **Sprache:** Das Dokument ist auf Deutsch verfasst. Technische Begriffe, Paketnamen, Dateipfade, Bezeichner und CLI-Beispiele bleiben englisch.
- **Hinweis:** Das Dokument ist vollständig; alle 13 Abschnitte sind befüllt und es enthält keinen TODO-Platzhalter. Es enthält genau einen Code-Fence (der Ziel-Layoutbaum in Abschnitt 7).

---

## 1. Executive Summary

Grundlage dieses Plans ist ein Audit des TypeScript-Bestands gegen den Commit `2ea466aa2528c16c7525d71861f155ee728b8e36`; lokaler `HEAD` und `origin/main` sind identisch, die Abweichungsregel greift nicht. Geprüft wurden 23 getrackte Dateien: der MCP-Entrypoint, drei Bibliotheksmodule, zehn Scripts, ein Smoke-Test, ein Beispiel-Contract sowie Build- und CI-Konfiguration. Das Repository ist ein Fork mit einem Contributor, ohne Issues, PRs, Releases oder Tags; die Lizenz ist MIT.

Die Befundlage ist in drei Klassen geordnet. Sicherheitsbefunde S1–S5 umfassen den Secret-Leak über `api_probe-uri`, den Token in der URL-Query, den Doppelrequest mit voller Auth und die unvollständige Log-Redaktion. Technische Schulden T1–T14 reichen von `as any` über das stille `catch {}` beim Laden von `tools.json` und die Registrierung nach `connect()` bis zur massiven Helfer-Duplikation in `scripts/`. Funktionale Lücken F1–F6 betreffen fehlendes Timeout, fehlende Cancellation, unvalidierte `tools.json`, fehlende Pfadparameter-Prüfung und die dünne Testabdeckung.

Tragende Entscheidungen: `modelcontextprotocol/go-sdk` v1.8.0 als first-party SDK mit der vollständigsten Protokollabdeckung; Transport ausschließlich `stdio`; sieben `internal`-Packages (`cli`, `config`, `mcp`, `tools`, `httpx`, `devtools`, `logging`); ein Tool-Ergebnisformat mit `isError: true` und stabiler `error_class` statt Protokollfehlern; Retry mit Full Jitter, `max_delay`-Cap und Timeout pro Versuch plus Gesamtbudget; strikt validierte Konfiguration mit deterministischer Priorität und zentraler Redaktion. Die Entscheidungen sind in den Abschnitten 5 bis 7 begründet.

Der Bruchumfang ist bewusst und vollständig in Abschnitt 8 dokumentiert: Tool-Namen, MCP-Servername, `stdio` und das `tools.json`-Format bleiben unverändert, während Eingabeschema, Antwort- und Fehlerformat, CLI-Start, Env-Namensraum, Retry-/Timeout-Semantik, Log-Format, `basic`-Auth und die Dev-/Build-Workflows brechen. Für alle Brüche existiert ein Env-Mapping (8.1) und eine Migrationsnotiz-Pflicht in Phase 9.9.

Die Umsetzung erfolgt in zehn Migrationsphasen von Audit und Modulinitialisierung über Konfiguration, MCP-Server, Tools, HTTP-Integration, Fehler-/Retry-/Logging-Schicht und Tests bis zur Dokumentation. Der gesamte TypeScript-Rückbau ist ausschließlich Phase 10 vorbehalten und setzt eine erfüllte Definition of Done voraus; in den Phasen 2–9 bleibt der TS-Bestand unverändert. Offene Punkte sind Verifikationspunkte, keine Blocker: die exakten SDK-Signaturen, `isError`/`structuredContent`, die SDK-Issues #499 und #1262 sowie die Go-1.25-Toolchain werden vor ihrer jeweiligen Phase geprüft (Abschnitt 12). Bewusst nicht migriert werden `.env.local`-Auto-Loading, `writeEnv`-Token-Ablage, `dist/`-Build, `PROBE_*`-/Script-Env-Variablen, Node-/npm-Toolchain, Pipeline-Design, SSE/Streamable HTTP und der In-Process-Betriebsmodus (Abschnitt 13.8).

---

## 2. Audit-Baseline und geprüfter Repository-Stand

### 2.1 Prüfstand und Abweichungsregel

- Verbindlicher Prüfstand laut `plan.md` Z. 11: `2ea466aa2528c16c7525d71861f155ee728b8e36`.
- Der lokale `HEAD` und `origin/main` wurden per `git rev-parse` geprüft und liefern **denselben** Commit `2ea466aa2528c16c7525d71861f155ee728b8e36`.
- Damit ist der Prüfstand identisch mit dem Stand des Default-Branch; die in `plan.md` Z. 13–17 definierte Abweichungsregel **greift nicht**, und der Audit gegen den Prüfstand ist gültig.
- Der externe Repo-Stand bestätigt denselben Commit und Default-Branch `main` (Evidenz C).
- `core.autocrlf` ist lokal **ungesetzt** (leere Ausgabe von `git config --get core.autocrlf`).

### 2.2 Audit-Grundlage

Geprüft wurden alle getrackten Bereiche des Repositories; die Baseline umfasst **23 getrackte Dateien** (`git ls-files`).

| Bereich | Inhalt |
|---|---|
| Repository-Root | `.gitignore`, `LICENSE`, `README.md`, `package.json`, `package-lock.json`, `tsconfig.json` |
| `.github/` | `workflows/ci.yml` |
| `src/` | `server.ts`, `lib/qs.ts`, `lib/logger.ts`, `lib/retry.ts` |
| `scripts/` | 10 Dateien (Discovery-, Probe-, Inventory- und OAuth2-Helfer) |
| `test/` | `server.smoke.test.ts` |
| `examples/` | `hexnode.tools.json` |

### 2.3 Externer Repo-Stand

Quelle: Evidenz C (`lib-1`).

| Merkmal | Wert |
|---|---|
| Repository | `github.com:sstreichan/API2MCP-creator.git` |
| Default-Branch | `main` |
| HEAD | `2ea466aa2528c16c7525d71861f155ee728b8e36` (identisch mit Prüfstand) |
| Offene Issues | 0 |
| Offene Pull Requests | 0 |
| Releases / Tags | keine (0 Tags) |
| Contributor | 1 (`ghively`) |
| Fork | ja |
| Stars | 0 |
| Lizenz | MIT |
| Commits | 7 |
| Letzter Commit | 2026-08-20 („ci: add GitHub Actions workflow…“) |

### 2.4 Nicht getrackte Artefakte

Die folgenden Artefakte sind **nicht** Teil der Baseline und wurden nicht auditiert:

- `plan.md` (Auftragsdokument)
- `AGENTS.md` (Agenten-Anweisungen)
- `.opencode/` (`git status` zeigt `?? .opencode/` → untracked, nicht ignored)
- `.ignore`
- `docs/` (newly created by this planning work — neu durch diese Planungsarbeit erstellt)

### 2.5 CRLF/LF-Sachverhalt

- `git status` zeigt **alle 23** getrackten Dateien als „modified“. Ursache ist reines Zeilenenden-Rauschen: Worktree mit CRLF, HEAD-Blob mit LF, `core.autocrlf` ungesetzt.
- Nach Entfernen der CR-Zeichen (`tr -d '\r'`) sind Worktree und HEAD byte-identisch; dies wurde per md5 an `src/server.ts` verifiziert.
- `git diff --ignore-cr-at-eol` lässt nur die beabsichtigte `.gitignore`-Änderung übrig.
- Ergebnis: **Inhaltlich ist der Worktree gleich der Baseline**; der Audit dagegen ist gültig. Etwaige Zeilenangaben beziehen sich auf den Blob-Stand (LF).

---

## 3. Ist-Analyse des TypeScript-Projekts

### 3.1 Toolchain und Runtime

| Aspekt | Befund |
|---|---|
| Runtime | Node.js `>=20.0.0` (`package.json:24`) |
| Sprache | TypeScript `^5.6.3`, `strict: true` (`package.json:33`, `tsconfig.json`) |
| Modulsystem | ESM (`"type": "module"`, `package.json:5`), `module`/`moduleResolution` = `NodeNext` (`tsconfig.json`) |
| Compile-Target | `ES2022`, `rootDir=src`, `outDir=dist`, `include=["src"]` → `scripts/` und `test/` werden **nicht** kompiliert (`tsconfig.json`) |
| TS-Runner | `tsx ^4.15.7` (Dev-Skripte und Test) |
| Runtime-Dependencies | `@modelcontextprotocol/sdk ^1.17.5`, `zod ^3.23.8` (`package.json:25-28`) |
| Dev-Dependencies | `@types/node ^20.12.12`, `tslib ^2.6.3` (nicht direkt importiert), `tsx ^4.15.7`, `typescript ^5.6.3` (`package.json:29-34`) |
| Lockfile | `package-lock.json`, `lockfileVersion` 3 |
| Paket-Metadaten | `name=any-api-mcp`, `version=0.1.0`, `private=true`, `license=MIT`, `main=dist/server.js`; **kein `bin`-Entry** (`package.json:2-8`) |
| npm-Scripts | `dev`, `build`, `start`, `test` sowie Discovery-/OAuth-Skripte via `tsx` (`package.json:9-23`) |

### 3.2 Modulinventar `src/`

`src/` umfasst vier Dateien mit insgesamt 252 Zeilen.

#### `src/server.ts` (187 Zeilen)

| Aspekt | Befund |
|---|---|
| Verantwortung | MCP-Entrypoint: Registrierung der 5 Core-Tools, Registrierung dynamischer Tools aus `tools.json`, HTTP-Ausführung, Auth, Logging |
| Exporte | **keine** (Modul ohne Export) |
| Abhängigkeiten | `@modelcontextprotocol/sdk`, `zod`, `./lib/qs.js`, `./lib/logger.js`, `./lib/retry.js` |
| Aufrufer | `test/server.smoke.test.ts` (als Kindprozess), `npm run dev`, `npm start` über `dist/server.js` |
| Eingaben | MCP-Tool-Aufrufe, Env-Variablen, optionale `tools.json` |
| Ausgaben | MCP-Responses (`resource` bzw. `text`), JSON-Logs auf stderr |
| Seiteneffekte | Env-Auswertung bei Modul-Load (`Z.10-16`), `process.exit(1)` ohne `API_BASE` (`Z.17-20`), Top-Level-`await server.connect(...)` (`Z.156`) |
| Env/Konfiguration | `API_BASE`, `AUTH_MODE`, `AUTH_TOKEN`, `AUTH_HEADER`, `AUTH_QUERY_KEY`, `ALLOW_DESTRUCTIVE`, `TOOLS_FILE` |
| Fehler-/Retry-Verhalten | Exceptions propagieren an den SDK-Handler; GET-Retry über `src/lib/retry.ts`; Tool-Laden in `try{}catch{}` (`Z.187`) |
| Sicherheit | Auth-HTTP-Header/-Query; Redaktion nur im Logger; `ALLOW_DESTRUCTIVE`-Gate für Writes |
| Testabdeckung | nur indirekt über den Smoke-Test (Registrierung der 5 Core-Tools); keine Handler-, Auth-, Retry- oder Fehlertests |

#### `src/lib/qs.ts` (8 Zeilen)

| Aspekt | Befund |
|---|---|
| Verantwortung | Query-String-Serialisierung |
| Export | `qs(params)` |
| Abhängigkeit | `URLSearchParams` (Stdlib) |
| Aufrufer | `src/server.ts:130,179` |
| Ein-/Ausgabe | nimmt Param-Map, liefert String; filtert `undefined`/`null`/`""` |
| Seiteneffekte | keine |
| Env/Konfiguration | keine |
| Fehler/Sicherheit | keine eigene Fehlerbehandlung; keine Kodierungs-/Redaktionslogik |
| Testabdeckung | keine Unit-Tests |

#### `src/lib/logger.ts` (27 Zeilen)

| Aspekt | Befund |
|---|---|
| Verantwortung | JSON-Logging auf stderr |
| Exporte | `logRequest({tool,method,url,status,ms})`, `time` |
| Sink | `console.error` → stderr (`Z.11`) |
| Aufrufer | `src/server.ts` |
| Eingaben | Log-Objekt |
| Ausgaben | eine JSON-Zeile auf stderr |
| Seiteneffekte | Schreiben auf stderr; `try/catch` schluckt Log-Fehler |
| Redaktion | nur URL-Query-Keys gegen `/key\|token\|secret\|password/i` (`Z.17-26`) |
| Testabdeckung | keine Unit-Tests, kein Redaction-Test |

#### `src/lib/retry.ts` (30 Zeilen)

| Aspekt | Befund |
|---|---|
| Verantwortung | Retry mit exponentiellem Backoff und Jitter |
| Exporte | `retry(fn,opts)`, `sleep`, `RetryOptions` |
| Aufrufer | `src/server.ts` (nur GET-Pfad) |
| Defaults | `attempts=3`, `minDelayMs=300`, `factor=2` (`Z.12-14`) |
| Delay-Berechnung | `base*factor^(attempt-1)`; ein `retryAfterMs`-Override ersetzt den Backoff absolut, sonst `backoff + random()*backoff` — **additiver Jitter, kein Full-Jitter**; die tatsächlichen Wartezeiten sind bis zu 2× größer und fallen nie unter die Basisverzögerung (`Z.23-25`) |
| Seiteneffekte | Timer-basiertes `sleep` |
| Fehlerbehandlung | Non-Error-Throws werden gewrappt (`Z.29`) |
| Sicherheit | keine |
| Testabdeckung | keine Unit-Tests |

### 3.3 Inventar `scripts/`

Zehn Dateien, ausgeführt ausschließlich via `tsx`:

| Script | Zweck | Bemerkenswert |
|---|---|---|
| `_load_env.ts` | `.env.local` → `process.env` (nur fehlende Keys), `#`-Kommentare, Quotes | nur in `scripts/` genutzt; `src/server.ts` liest `process.env` direkt |
| `discover_openapi.ts` | 11 Kandidaten-URLs auf OpenAPI prüfen, Endpunkte listen | dupliziert `joinUrl`/`applyAuth`/`parseRetryAfter`/`sleep` inline |
| `scan_wordlist.ts` | OPTIONS-Wordlist-Scan (20 Default-Wörter), mit/ohne Trailing-Slash | dupliziert dieselben Helfer und enthält zusätzlich adaptive MIN/MAX-Backoff-Logik, die `src/lib/retry.ts` fehlt |
| `probe_get.ts` | gedrosselter GET-Probe über `PROBE_PATHS` | `applyAuth` mit **anderer Signatur** (liefert String, mutiert keine Header) |
| `validate_endpoints.ts` | `/`, `/status`, `/health` mit GET/OPTIONS | `addHeader()` ist toter Code; die Header-Auth läuft über `baseHeaders()` und wird an `fetch` übergeben — die Läufe sind **authentifiziert** |
| `inventory_api.ts` | Orchestrator: discover → Fallback scan, Reports nach `OUTPUT_DIR` | spawnt andere Scripts als Kindprozesse |
| `openapi_to_tools.ts` | OpenAPI-JSON → `tools.json` | `normalizeName` unique |
| `scan_to_tools.ts` | Scan-Report → `tools.json` | `normalizeName` **dupliziert** |
| `oauth2_client.ts` | Client-Credentials → Token in `.env.local` | `writeEnv` unique |
| `oauth2_device.ts` | Device-Code-Flow + Polling → Token in `.env.local` | `writeEnv` **dupliziert** |

**Duplikations-Hotspots:** `applyAuth` 4×, `sleep` 4×, `parseRetryAfter` 3×, `joinUrl` 2× namentlich (plus inline `url()`-Varianten); kanonisch liegen sie in `src/server.ts:23-28` bzw. `src/lib/retry.ts`, jeweils mit abweichenden Signaturen. Zusätzlich: `normalizeName` 2×, `writeEnv` 2×. Insgesamt schwere Duplikation mit divergierenden Signaturen.

**Env-Variablen der Scripts:** `_load_env.ts` lädt `.env.local`, überschreibt keine vorhandenen `process.env`-Werte. Dokumentierte Knobs (README:146-149): `PROBE_DELAY_MS`, `OUTPUT`/`OUTPUT_DIR`, `WORDLIST`. Für die OAuth2-Skripte zusätzlich `TOKEN_URL`, `CLIENT_ID`, `CLIENT_SECRET`, `SCOPE`, `DEVICE_AUTH_URL` (README:40-52), für die Tool-Generatoren `OPENAPI_FILE`/`SCAN_FILE` sowie `TOOLS_FILE` (README:159,164).

### 3.4 `test/`

- Genau eine Testdatei: `test/server.smoke.test.ts` (`node:test` + `node:assert/strict`).
- Sie spawnt `src/server.ts` via `tsx` als Kindprozess (`Z.59`) und fährt den JSON-RPC-Handshake: `initialize` (id 1, `protocolVersion: "2024-11-05"`) → `notifications/initialized` → `tools/list` (id 2).
- Assertion: `result.tools` enthält `api_probe`, `api_get`, `api_post`, `api_put`, `api_delete`. Env: `API_BASE=https://api.example.com/v1`.
- **Nicht abgedeckt:** Auth, Retry, Fehlerbehandlung, dynamische Tool-Registrierung aus `tools.json`, echte HTTP-Calls, `qs`, Logger-Redaction.

### 3.5 `examples/hexnode.tools.json` als Format-Contract

- Top-Level: `generatedAt` (ISO-String), `tools` (Array).
- Pro Tool vorhanden: `name`, `description`, `method`, `pathTemplate`, `pathParams[]`, `queryParams[]`, `hasBody`, `guarded`.
- Der Konsument `src/server.ts:160-187` nutzt tatsächlich nur `name`, `description`, `method`, `pathTemplate`, `guarded`; `pathParams`, `queryParams`, `hasBody` werden **ignoriert**. Defaults: `method→GET`, `guarded→!GET`.
- **Keine Validierung** (kein JSON-Schema, kein Zod); unbekannte Felder werden still ignoriert.

### 3.6 Build und CI

- Build: `npm run build` = `tsc -p tsconfig.json` → `dist/`.
- Test: `npm test` = `tsx --test test/server.smoke.test.ts`.
- CI (`.github/workflows/ci.yml`): Trigger push/PR auf `main`, `ubuntu-latest`, Node 20, Ablauf `npm ci` → `npm run build` → `npm test`.
- **Keine Lint-Stufe, kein separater Typecheck-Schritt, keine Matrix, kein Deploy/Release.**

### 3.7 MCP-Contract

#### 3.7.1 Core-Tools (5)

Alle Registrierungen übergeben `.shape` (nie das Schema-Objekt). Beschreibungen verbatim:

| Tool | Beschreibung | Pflichtfeld | Optionale Felder | Defaults |
|---|---|---|---|---|
| `api_probe` | „Probe an API path with any method (safe).“ | `path` | `method`, `headers`, `max_bytes` (int>0) | `method="GET"`, `max_bytes=4096` (`Z.105`) |
| `api_get` | „Generic GET against API_BASE (safe).“ | `path` | `query`, `headers` (`Z.106`) | — |
| `api_post` | „Generic POST against API_BASE (guarded).“ | `path` | `payload`, `headers` (`Z.107`) | — |
| `api_put` | „Generic PUT against API_BASE (guarded).“ | `path` | `payload`, `headers` | — |
| `api_delete` | „Generic DELETE against API_BASE (guarded).“ | `path` | `payload`, `headers` | — |

**Rückgabeformat:**

- Erfolg → `{content:[{type:"resource",resource:{uri:<url>,mimeType:"application/json",text:JSON.stringify(data)}}]}`.
- `api_probe` → `text = JSON.stringify({url,status,contentType,bytes,preview})` (`Z.125-126`).
- Guarded-Antwort bei `ALLOW_DESTRUCTIVE !== "true"` → `{content:[{type:"text",text:"Destructive disabled. Set ALLOW_DESTRUCTIVE=true to enable <METHOD>."}]}` (`Z.136,143,150`).
- `api_delete` mit `null`-Daten → `JSON.stringify(data ?? {})` (`Z.153`).
- **Fehlerpfad:** Bei nicht-2xx-Antworten wirft `HttpError` (`status`, `excerpt` = erste 200 Zeichen des Upstream-Bodys, optional `retryAfterMs`) und propagiert an den MCP-Handler → JSON-RPC-Fehler mit dem Text `HTTP <status>: <excerpt>`. Das ist das Fehlerformat der Tools (relevant für negative Tests).

#### 3.7.2 Dynamische Tools aus `tools.json`

- Eingabeschema: `{pathParams?: Record<string,string>, query?: Record<string,unknown>, payload?: unknown, headers?: Record<string,string>}` — **keine Pflichtfelder** (`Z.171-176`).
- Pfadinterpolation `/\{(.*?)\}/g` → `encodeURIComponent(String(input.pathParams?.[k] ?? ""))` (`Z.178`).
- Query wird **nur bei GET** angehängt (`Z.179`).
- `guarded`-Default = `method !== "GET"` (`Z.169`).
- Registrierung erfolgt **nach** `connect()` (`Z.156` vs. `Z.158-185`) → Race mit einem frühen `tools/list`.
- Der gesamte Ladeblock liegt in `try{}catch{}` (`Z.187`).

#### 3.7.3 Transport und Server-Lifecycle

- Transport: `StdioServerTransport`; `await server.connect(...)` auf **Top-Level** (`Z.156`).
- `TOOLS_FILE` wird relativ zum `cwd` aufgelöst (`path.resolve(process.cwd(), …)`, `Z.160-161`).
- **Kein Graceful Shutdown**, keine Signalbehandlung.

#### 3.7.4 HTTP-Aufbau

- `joinUrl` (`Z.23-28`): absolute URLs (`/^https?:\/\//i`) bleiben unverändert; sonst wird ein Trailing-Slash am Base entfernt und ein Leading-Slash am Pfad erzwungen.
- Query nur über `qs()`; die Methode wird immer in Großbuchstaben gesetzt, Default `GET` (`Z.58`).
- Header-Reihenfolge: immer `Content-Type: application/json`, danach Nutzer-Header, danach Auth (`Z.59-61`).
- Body: `JSON.stringify(payload)` für POST/PUT/DELETE (`Z.137,144,151`); `undefined`, wenn nicht gesetzt.
- Fetch-Aufruf: `fetch(url,{method,headers,body} as any)` (`Z.65`).
- Nicht-JSON-Antwort → `JSON.parse(text)`; leerer Text → `undefined as any` (`Z.77-80`).

#### 3.7.5 Auth (5 Modi)

`src/server.ts:30-46`:

| Modus | Verhalten |
|---|---|
| `none` | kein Auth-Header/-Query |
| `bearer` | `Authorization: Bearer <AUTH_TOKEN>` |
| `header` | `<AUTH_HEADER>: <AUTH_TOKEN>` |
| `basic` | `Authorization: Basic <AUTH_TOKEN>` (Aufrufer liefert Base64) |
| `query` | `<AUTH_QUERY_KEY>=<AUTH_TOKEN>` in der URL; Fallback per Stringkonkatenation mit `encodeURIComponent` |

#### 3.7.6 Logging

- `console.error(JSON.stringify({tool,method,url,status,ms}))` → stderr; in `src/` existiert **kein** `console.log`, daher keine Kollision mit dem Stdio-Protokoll.
- Redaktion nur für URL-Query-Keys anhand `/key|token|secret|password/i` (`src/lib/logger.ts:17-26`).
- `try/catch` schluckt Log-Fehler (`src/lib/logger.ts`).

#### 3.7.7 Retry, Timeout, Backoff, Cancellation

- Retry **nur für GET**: `attempts 3`, `minDelayMs 300`, `factor 2`, `backoff + random()*backoff` — **additiver Jitter, kein Full-Jitter**; die tatsächlichen Wartezeiten sind bis zu 2× größer und fallen nie unter die Basisverzögerung (`src/lib/retry.ts:12-14,23-25`).
- Retryable Statuscodes: `429,502,503,504` (`src/server.ts:87`).
- `Retry-After` wird als Sekunden oder HTTP-Datum akzeptiert und ersetzt den Backoff absolut (`Z.48-53,70`).
- Non-GET = Single-Attempt (`Z.92-96`).
- **Kein Request-Timeout, kein `AbortSignal`, keine Cancellation.**

#### 3.7.8 Implizite Defaults und Modul-Level-State

Alle Env-Werte werden **einmalig bei Modul-Load** ausgelesen, es gibt kein Hot-Reload (`src/server.ts:10-16`):

| Variable | Default | Besonderheit |
|---|---|---|
| `API_BASE` | leer → `process.exit(1)` | Pflicht |
| `AUTH_MODE` | `none` | lowercase |
| `AUTH_TOKEN` | `""` | — |
| `AUTH_HEADER` | `Authorization` | — |
| `AUTH_QUERY_KEY` | `api_key` | — |
| `ALLOW_DESTRUCTIVE` | `false` | **String-Vergleich** `!== "true"` (`Z.15`) |
| `TOOLS_FILE` | `tools.json` | `path.resolve(process.cwd(), …)` (`Z.160-161`) |

### 3.8 README-Divergenzen

- `TOOLS_FILE` ist in `src/server.ts:160` wirksam, im Env-Var-Abschnitt des README aber **nicht dokumentiert**.
- Die in Evidenz A behauptete Divergenz zu `api_probe` (README:82) ist **widerlegt**: `api_probe` besitzt ein optionales `method` (Default `"GET"`) und reicht es an beide Requests durch (`src/server.ts:105,111-114,120`); README:82 ist korrekt. An dieser Stelle besteht kein README-Bruch.

---

## 4. Technische Schulden, Sicherheitsbefunde und Funktionslücken

Die Nummerierung ist über das Dokument hinweg stabil: `S…` = Sicherheitsbefund, `T…` = technische Schuld, `F…` = funktionale Lücke. Die Tabelle enthält die 20 verdichteten Befunde aus Evidenz B sowie ergänzende Befunde aus Evidenz A. Schweregrade: kritisch / hoch / mittel / niedrig.

### (a) Sicherheitsbefunde

| Nr. | Ort | Befund | Konkrete Konsequenz | Schwere |
|---|---|---|---|---|
| S1 | `src/server.ts:126` | `api_probe` gibt `uri: url` zurück — im `query`-Auth-Mode **inklusive Token** | **Secret-Leak an den MCP-Client**; der Token steht im Response-Payload | kritisch |
| S2 | `src/server.ts:36-41` | Auth-Token wird in die URL-Query geschrieben | Token sichtbar in Proxy-/Access-Logs, Browser-History und `Referer` | hoch |
| S3 | `src/server.ts:114,120` | `api_probe` sendet **zwei** Requests mit voller Auth | verschwendeter Request; der zweite `fetch` (`src/server.ts:120`) umgeht Retry- und Fehlerbehandlung | mittel |
| S4 | `src/lib/logger.ts:22` | Redaktion erfasst nur Query-Parameter | geloggt wird ausschließlich die URL; die Redaktion greift nur auf die Query-Parameter-Keys; ein Secret im URL-**Pfad** bliebe unredigiert | mittel |
| S5 | `src/server.ts:41` | Fallback-URL-Bau im `query`-Mode | manuelle Stringkonkatenation im Fallback statt URL-API (Kodierung ist in beiden Zweigen gegeben); Restrisiko nur, dass der Query-**Key** unkodiert bleibt | niedrig |

### (b) Technische Schulden

| Nr. | Ort | Befund | Konkrete Konsequenz | Schwere |
|---|---|---|---|---|
| T1 | `src/server.ts:65` | `as any` auf den Fetch-Optionen | Typfehler werden maskiert | niedrig |
| T2 | `src/server.ts:79` | `undefined as any` bei leerer Nicht-JSON-Antwort | ungültiges JSON im MCP-Response | mittel |
| T3 | `src/server.ts:156,158-185` | dynamische Tools werden erst nach `connect()` registriert | Race: ein frühes `tools/list` kann sie verpassen | hoch |
| T4 | `src/server.ts:187` | stilles `catch {}` beim Tool-Laden | fehlerhafte `tools.json` bleibt unsichtbar | hoch |
| T5 | `src/server.ts:112` | `? "" : ""`-Ternär | toter Code | niedrig |
| T6 | `src/server.ts:115` | Kommentar „fetch body separately with GET“ widerspricht dem Code (`input.method`, `Z.120`) | irreführend für Wartung | niedrig |
| T7 | `src/server.ts:10-16` | Env wird nur bei Modul-Load gelesen | kein Hot-Reload von Konfiguration | mittel |
| T8 | `src/server.ts:15` | `ALLOW_DESTRUCTIVE` per String-Vergleich | `!== "true"` ist **fail-closed** (nur exakt `"true"` aktiviert Writes) → Betriebs-Footgun, kein Sicherheitsloch | mittel |
| T9 | `src/server.ts:59` | `Content-Type: application/json` wird immer gesetzt | der Server erzeugt nie multipart (nur `JSON.stringify`), und ein bodyless GET mit diesem Header ist harmlos | niedrig |
| T10 | `src/lib/retry.ts:29` | Non-Error-Throws werden gewrappt | Stacktrace geht verloren | niedrig |
| T11 | — | kein Graceful Shutdown / Signal-Handling | unsauberes Prozessende, keine Aufräumphase | mittel |
| T12 | `src/server.ts:87` | HTTP 500 ist nicht retryable | undokumentiertes Verhalten bei Serverfehlern | niedrig |
| T13 | `scripts/*` | `joinUrl`/`applyAuth`/`sleep`/`parseRetryAfter` 4× re-implementiert; `normalizeName` 2×, `writeEnv` 2× — jeweils mit abweichenden Signaturen | divergierende Auth-/Retry-Semantik zwischen Scripts und Server; hoher Wartungsaufwand | mittel |
| T14 | `scripts/validate_endpoints.ts:23` | `addHeader()` ist toter Code; die Header-Auth läuft über `baseHeaders()` und wird an `fetch` übergeben — die Läufe sind **authentifiziert**. | nur Wartungs-/Verwechslungsrisiko, **keine** unauthentifizierten Requests | niedrig |

### (c) Funktionale Lücken

| Nr. | Ort | Befund | Konkrete Konsequenz | Schwere |
|---|---|---|---|---|
| F1 | — | kein Request-Timeout | hängende APIs blockieren den Handler unbegrenzt | hoch |
| F2 | — | kein `AbortSignal` / keine Cancellation | ein MCP-Cancel kann laufende Requests nicht abbrechen | hoch |
| F3 | `src/server.ts:178` | fehlende Path-Parameter-Werte werden zu `""`; keine Pflichtfeldprüfung | URLs wie `/devices//`, stille Fehlanfragen | hoch |
| F4 | `src/server.ts:160-187`, `examples/hexnode.tools.json` | `tools.json` wird ohne Schema/Zod validiert; unbekannte Felder werden still ignoriert | fehlerhafte Tool-Definitionen schlagen erst zur Laufzeit oder gar nicht sichtbar fehl | hoch |
| F5 | `test/server.smoke.test.ts` | nur ein Smoke-Test; keine Unit-Tests für `qs`, `retry`, `logger`, `applyAuth`, `joinUrl`, `parseRetryAfter`, `HttpError`; kein Auth-, Fehler-, Retry-, Timeout-, Redirect- oder dynamische-Tools-Test; keine echten HTTP-Calls | Regressionen in der Kernlogik bleiben unentdeckt | mittel |
| F6 | `README.md:146-151` vs. `src/server.ts:160` | `TOOLS_FILE` ist im Env-Abschnitt des README nicht dokumentiert | Betreiber finden den Konfigurationsweg nicht | niedrig |

---

## 5. Zielbild und begründete Architekturentscheidungen

Das Zielprodukt ist ein in Go implementierter, lokal über stdio betriebener MCP-Server, der eine beliebige HTTP-API mit fünf generischen Kern-Tools und optional dynamisch aus `tools.json` registrierten Tools als MCP-Toolset bereitstellt. Es ist ausdrücklich **kein** Proxy- oder Gateway-Dienst, **kein** Cloud-Deployment und **kein** Mehrbenutzer-Backend: v0.1.0 bleibt ein Einzelprozess-CLI für einen lokalen MCP-Client. Gegenüber dem TypeScript-Bestand werden die in Abschnitt 4 belegten Sicherheits-, Timeout-, Abbruch- und Fehlerpfad-Schwächen behoben, der Transport wird auf stdio begrenzt und das Verhalten wird deterministisch konfiguriert und strikt validiert. Der Preis dafür sind dokumentierte Brüche an Eingabeschemas, Rückgabe- und Fehlerformat sowie am Env-Namensraum. Der TypeScript-Bestand bleibt bis zum Abschluss der Migration unverändert; der Rückbau erfolgt erst in der letzten Phase (Abschnitt 9/10/12).

### 5.1 Modul- und Produktidentität

- **Entscheidung:** Go-Modulpfad `github.com/sstreichan/api2mcp`; Binary `api2mcp`; MCP-Server-Name bleibt `any-api-mcp`; Startversion `v0.1.0`; Go-Minimum 1.25.
- **Begründung:** Der MCP-Server-Name `any-api-mcp` ist die Client-Identität aus `package.json:2` und wird von bestehenden Client-Konfigurationen referenziert — für einen Bruch gibt es keinen technischen Grund. Der Modulpfad folgt dem Remote-Repo `github.com:sstreichan/API2MCP-creator.git` (Evidenz C) in Go-üblicher Kleinschreibung. Das SDK `modelcontextprotocol/go-sdk` verlangt mindestens Go 1.25.0 (Evidenz C).
- **Konsequenz:** `version` gibt Produktversion und Server-Namen getrennt aus; der erste Release-Tag lautet `v0.1.0`.
- **Verworfene Alternativen:** Beibehaltung des Repo-Namens als Modulpfad (unübliche Groß-/Kleinschreibung, kein Mehrwert); Umbenennung des MCP-Server-Namens (bricht Client-Konfigurationen ohne Nutzen).

### 5.2 Projektlayout

- **Entscheidung:** `cmd/` plus `internal/` mit kleinen, klar verantwortlichen Packages (Details in Abschnitt 7). Die sieben `internal`-Packages sind `cli`, `config`, `mcp`, `tools`, `httpx`, `devtools`, `logging`. Explizite Grenzen: CLI, Konfiguration, MCP-Adapter, Tool-Definitionen inklusive `tools.json`-Modell und -Laden, HTTP-Client, Devzeit-Helfer, Logging.
- **Entscheidung (`tools.json`):** `internal/toolfile` entfällt; das Laden, die strikte Validierung und die Erzeugung dynamischer Tool-Definitionen wandern nach `internal/tools`. `internal/version` entfällt ebenfalls; Version/Build-Metadaten wandern nach `internal/cli`.
- **Entscheidung (`devtools`):** `internal/discovery` und `internal/oauth2` werden zu einem Package `internal/devtools` zusammengefasst (Devzeit-Helfer, ausdrücklich **nicht** Teil des `serve`-Pfads). Eigene Verantwortung des Packages ist das adaptive Pacing der Scan-/Probe-Läufe (Delay steigt bei 429, sinkt bei Erfolg — vgl. `scripts/scan_wordlist.ts:79-87`), ausdrücklich **verschieden** vom `httpx`-Retry.
- **Datenfluss statt Code-Abhängigkeit:** `tools` enthält Kern-Tools **und** das `tools.json`-Modell/-Laden; `devtools` **schreibt** `tools.json`, `tools` **liest** es. Das ist Datenfluss, **keine** Code-Abhängigkeit; die Importrichtung bleibt azyklisch.
- **Begründung:** Der Bestand vermischt Verantwortlichkeiten in `src/server.ts` (187 Zeilen: Env, Tools, HTTP, Auth, Logging) und dupliziert Helfer über `scripts/` (T13). Kleine `internal/`-Packages schneiden diese Grenzen entlang der tatsächlichen Nutzung und verhindern, dass `scripts/`-Wissen erneut dupliziert wird. Sieben Packages sind die Untergrenze für die real vorhandenen Verantwortlichkeiten; weitere Splits hätten keine Konsumenten.
- **Konsequenz:** Keine Framework-Schicht und keine generische Abstraktion ohne konkreten Aufrufer; jedes Package hat mindestens einen realen Konsumenten.
- **Verworfene Alternativen:** monolithisches `main`-Package (wiederholt die `server.ts`-Vermischung); `pkg/`-Baum auf Vorrat (öffentliche API-Fläche ohne externen Konsumenten); separater `toolfile`-/`version`-/`discovery`-/`oauth2`-Split (Packages ohne eigenständige Verantwortung).

### 5.3 CLI, Flags, Konfigurationsquellen und Priorität

- **Entscheidung:** Subcommands `serve` (Default), `discover`, `oauth2`, `version`; Umsetzung mit stdlib `flag` und einem kleinen Dispatcher in `internal/cli`. Priorität deterministisch und **pro Feld**: CLI-Flags > Umgebungsvariablen > Konfigurationsdatei > Defaults. Konfigurationsdatei optional als **JSON** mit striktem Decoding (unbekannte Felder = Fehler), Pfad über `API2MCP_CONFIG` bzw. `--config`. Env-Namensraum `API2MCP_*`. Secrets niemals über CLI-Flags. Dokumentierte, stabile Exit-Codes.
- **Begründung:** Vier Subcommands rechtfertigen keine Dependency; der Bestand nutzt bewusst keine CLI-Bibliothek. JSON ist die minimale dependency-freie Variante (stdlib `encoding/json`), striktes Decoding verhindert die stille Ignoranz unbekannter Felder, die im TS-Bestand bei `tools.json` belegt ist (Abschnitt 3.5). Der Namensraum `API2MCP_*` bricht bewusst mit `API_BASE`/`AUTH_MODE`/… (`package.json`-bzw. `src/server.ts:10-16`), weil generische Namen mit den Env-Variablen der Ziel-API kollidieren können. Dass `--auth-token` bewusst fehlt, verhindert Secret-Leaks über Prozessliste und Shell-History.
- **Konsequenz:** Jedes Feld wird einzeln aus der höchsten vorhandenen Quelle aufgelöst; `--help` und `version` funktionieren ohne gültige Konfiguration. Kanonische Exit-Codes: `0` Erfolg; `1` generischer Laufzeitfehler; `2` Usage-Fehler (unbekannter Subcommand, ungültige/fehlende Flags); `3` Konfigurationsfehler (ungültige oder fehlende Pflichtkonfiguration, Bool-Parse-Fehler, `0600`-Verweigerung, ungültige `tools.json`); `4` Auth-Fehler zur Laufzeit (Upstream 401/403 bei CLI-Kommandos); `130` SIGINT/SIGTERM.
- **Keine Alias-Unterstützung:** Die alten Env-Namen werden nicht weiter unterstützt. Zwei dauerhaft parallel gepflegte Konfigurationsoberflächen widersprechen der bewussten Bruch-Strategie und erzeugen stille Fehlkonfiguration (belegt die „kein Alias"-Aussage in Abschnitt 8.1).
- **Verworfene Alternativen:** `spf13/cobra` (Dependency für vier Subcommands); YAML/TOML/dotenv (neue Dependency ohne Bedarf); Konfiguration über CLI-Secrets (Prozessliste/Shell-History); Alias-Unterstützung für Alt-Env-Namen (doppelte Konfigurationsoberfläche).

### 5.4 MCP-SDK

- **Entscheidung:** `github.com/modelcontextprotocol/go-sdk` v1.8.0.
- **Begründung (Evidenz C):** first-party Referenzimplementierung; vollständigste Protokollabdeckung mit allen fünf Revisionen inklusive `2026-07-28` (Default); stdio und In-Memory-Transport; beste Testbarkeit über `mcp.NewInMemoryTransports()`; Apache-2.0 (neuer Code) + MIT (Altbeiträge), CC-BY-4.0 für Docs; 128 Commits in drei Monaten, letzter 2026-09-18; v1.x seit 2026-05-08.
- **Konsequenz:** Stdio-Produktionspfad und In-Memory-Testpfad teilen denselben Adapter; Details in Abschnitt 6.
- **Verworfene Alternativen:** `mark3labs/mcp-go` — erst 16 Tage in v1.x, offene Spec-Lücke #928 (SEP-2575), stdio-Deadlock-Risiko #976 → nur Fallback. `metoro-io/mcp-golang` — 0 Commits in 7 Monaten, 28 unbeantwortete Issues, Pre-`2026-07-28`. `ThinkInAIXYZ/go-mcp` — nur bis `2025-03-26`, Streamable HTTP und In-Memory-Test unbestätigt.
- **Verifikationspunkte:** #499 (Goroutine-Leak im Session-Cleanup) und #1262 (SSE-Write-Timeout) vor der Festlegung auf stdio-only prüfen; die exakten Registrierungs- und Handler-Signaturen der Bibliothek vor Migrations-Phase 4 gegen die Doku verifizieren.

### 5.5 Transport

- **Entscheidung:** ausschließlich `stdio`. Kein stdout-Schreiben außerhalb des SDK.
- **Begründung:** Das Binary wird lokal als MCP-Server für einen lokalen Client ausgeführt; pro Tool-Aufruf gilt ein Request/Response-Muster. Es gibt keine Netz-Exposition, keinen Session- und keinen eigenen Auth-Bedarf. Der TS-Bestand nutzt bereits `StdioServerTransport` (`src/server.ts:156`).
- **Konsequenz:** Der MCP-Adapter kapselt den Transport so, dass Tests denselben Pfad über In-Memory-Transports fahren können.
- **Verworfene Alternativen:** Netz-Transports als Produktionsweg (siehe 5.6).

### 5.6 Alternative Transports

- **Entscheidung:** SSE, Streamable HTTP und In-Process als **Produktionsweg** sind für v0.1.0 bewusst ausgeschlossen; In-Memory bleibt ausschließlich Testmittel.
- **Begründung:** Netz-Transports erhöhen Angriffsfläche und Scope (HTTP-Auth, Sessions, CORS, TLS), ohne dass ein aktueller Bedarf belegt ist; Deployment/Cloud ist laut Auftrag nicht im Scope.
- **Konsequenz:** In-Memory wird nur in Tests verwendet (5.12), nicht als Server-Betriebsmodus.
- **Revisit-Trigger:** Remote- oder Mehrbenutzerbetrieb, zentrale Bereitstellung für mehrere Clients oder ein Serverless-Ziel.

### 5.7 Öffentliche Tool-Schnittstelle

- **Entscheidung (Namen):** Die Kern-Tools `api_get`, `api_post`, `api_put`, `api_delete`, `api_probe` behalten ihre Namen; Schema, Rückgabe und Fehler ändern sich und werden als dokumentierter Bruch geführt.
- **Entscheidung (Eingabe):** einheitliches Schema `{ path (required, string), query (optional, Record<string,unknown>), headers (optional, Record<string,string>), payload (optional, JSON-Wert — nur Schreib-Tools) }`. `api_probe` zusätzlich `method` (Default `GET`) und `max_bytes` (Default 4096). `Content-Type: application/json` wird **nur** bei vorhandenem Body gesetzt, mit optionalem Override — behebt T9. Nutzer-Header werden zuerst angewandt, Auth-Header danach; Auth gewinnt, und das ist explizit dokumentiert.
- **Entscheidung (`api_probe`):** `api_probe` führt **genau einen** Request über den zentralen `httpx`-Client aus (inklusive Retry, Fehlerklassifizierung, Timeout, Redirect-Policy und Größenlimit). Der Doppelrequest des TS-Bestands (`src/server.ts:114,120`, Befund S3) entfällt damit vollständig; der zugehörige irreführende Kommentar (T6) entfällt mit dem Code.
- **Entscheidung (Rückgabe):** Antwort ist `content: [ {type:"text", text:<JSON>} ]` **plus** `structuredContent` mit demselben Objekt. Es gibt **kein** `resource`/`uri`-Echo der credentialtragenden URL mehr — behebt die Leak-Klasse aus S1 —; stattdessen wird eine **sanitisierte** URL ausgegeben. Erfolgsnutzlast: `{ ok:true, status, url, duration_ms, body }`, für `api_probe` `{ ok:true, status, url, content_type, bytes, preview, duration_ms }`.
- **Entscheidung (Fehler):** Erwartbare Fehler (Upstream-4xx/5xx, Timeout, Abbruch, Netzwerk, ungültige Eingabe, zu große Antwort) werden als **Tool-Ergebnis mit `isError: true`** und stabiler `error_class` ausgegeben — **kein** JSON-RPC-Protokollfehler. Nur Protokoll-Missbrauch (unbekanntes Tool, Schemaverletzung) bleibt Protokollfehler. Klassen: `invalid_input`, `config`, `upstream_http`, `timeout`, `canceled`, `network`, `response_too_large`, `parse`. Das ersetzt den früheren `undefined as any`-Pfad (T2) und die fehlende Fehlersystematik.
- **Begründung:** Der TS-Bestand gab die vollständige Request-URL inklusive Token als `uri` zurück (S1) und ließ Fehler als generische Exceptions propagieren; beides ist weder sicher noch für negative Tests stabil. `structuredContent` erlaubt Clients maschinenlesbare Auswertung ohne den `resource`-Echo.
- **Konsequenz:** Bestehende TS-Clients müssen Schema, Rückgabe und Fehlerbehandlung anpassen — der Bruch ist in Abschnitt 8 zu führen.

### 5.8 Dynamische Tools (`tools.json`)

- **Entscheidung:** Format der bestehenden Felder beibehalten (`name`, `description`, `method`, `pathTemplate`, `pathParams`, `queryParams`, `hasBody`, `guarded`, `generatedAt`) und **strikt validieren**: unbekannte Felder, fehlende Pflichtfelder, ungültiges Namensformat, nicht erlaubte Methoden und Namenskollision mit Kern-Tools führen zum Startfehler. Alle Felder werden tatsächlich ausgewertet: `pathParams` erzeugen Pflicht-Eingabefelder je `{placeholder}`, fehlende Parameter sind ein validierter Fehler statt einer `//`-URL (behebt F3); `queryParams` und `hasBody` werden berücksichtigt. Registrierung **vor** `connect()` — behebt das Race aus T3.
- **Begründung:** Der TS-Konsument ignorierte `pathParams`, `queryParams` und `hasBody` (Abschnitt 3.5) und validierte nichts (F4); `try{}catch{}` versteckte Fehler (T4). Die Beibehaltung des Formats erhält die mit `examples/hexnode.tools.json` erzeugten Artefakte.
- **Verworfene Alternative:** komplettes Format-Redesign (unnötiger Bruch, generierte Artefakte würden unbrauchbar).

### 5.9 HTTP-Client-Architektur

- **Entscheidung:** genau ein geteilter `*http.Client` mit explizitem `Transport` (kein globaler Default-Client). Timeout **pro Versuch** über `context.WithTimeout` (Default 30 s, konfigurierbar) plus Gesamtbudget. Der `context.Context` wird vom MCP-Handler durchgereicht → echte Abbruchfähigkeit — behebt F1 und F2.
- **Entscheidung (Retry):** nur idempotente Methoden (GET/HEAD), Defaults `max_attempts=3`, `base_delay=300 ms`, `factor=2`, **Full Jitter** (Wartezeit ∈ [0, Backoff]) mit `max_delay`-Cap. `Retry-After` (Sekunden und HTTP-Datum) überschreibt den Backoff und respektiert den Cap. Retrybare Status **429/502/503/504**; 500 bewusst **nicht**. Der Wechsel von additivem Jitter (TS-Bestand, `src/lib/retry.ts:23-25`) zu Full Jitter ist eine bewusste Semantikänderung und wird als solche geführt.
- **Entscheidung (Redirects):** explizite Policy, maximal 5 Hops, nur `http`/`https` erlaubt; bei Host-Wechsel werden Credentials **nicht** weitergegeben (Auth-Header und Query-Token werden entfernt).
- **Entscheidung (Antwortgrenzen):** Lesen ist auf `max_response_bytes` begrenzt (Default 10 MiB — **neues, bewusst hinzugefügtes Verhalten**, keine TS-Parität) → `response_too_large`. JSON wird nur bei JSON-`Content-Type` geparst, sonst wird `{ content_type, bytes, preview, truncated }` geliefert.
- **Entscheidung (URL-Sanitisierung):** vor Logging **und** vor Rückgabe. Auth wird zentral angewandt; `AUTH_MODE` ∈ {none, bearer, header, basic, query}. `basic` erwartet jetzt **rohes `user:password`** und kodiert selbst — der TS-Bestand verlangte fertiges Base64 (Abschnitt 3.7.5) und wird als Bruch benannt. Bei Modus ≠ none und leerem Token bricht der Start ab.
- **Bewusste Risikoübernahme (`AUTH_MODE=query`):** Der Modus behält das in Abschnitt 4 als **S2** geführte Risiko (Token in der URL, sichtbar in Proxy-/Access-Logs und `Referer`). Er bleibt bewusst erhalten, weil es APIs ohne Header-Alternative gibt. Mitigationen: Startwarnung bei `AUTH_MODE=query`, zentrale Redaktion, credentialtragende URL wird **niemals** geloggt und **niemals** im Tool-Ergebnis zurückgegeben. Das ist eine bewusste Risikoübernahme, kein offener Mangel.
- **Begründung:** Der Bestand hatte kein Timeout und keine Cancellation (F1/F2), ließ `Redirect`- und Größenverhalten offen und baute die `query`-Auth im Fallback per Stringkonkatenation (S5).
- **Konsequenz:** Auth, Retry, Redirects und Limits sind zentral testbar (Abschnitt 10) und werden nicht mehr pro Aufrufpunkt dupliziert.

### 5.10 Konfigurations- und Secret-Strategie

- **Entscheidung:** fail-fast und vollständig validiert beim Start; keine impliziten Defaults, die Verhalten still ändern. Secrets nur aus Env oder Datei; niemals in Logs, Fehlern, Tool-Ergebnissen oder Antwort-URLs. Enthält eine Konfigurationsdatei ein Secret und ist sie weiter als `0600` berechtigt, wird der Start **verweigert** (prüfbare Sicherheitseigenschaft; **neues, bewusst hinzugefügtes Verhalten**, keine TS-Parität). Zentrale Redaktion: (a) Query-Werte sensitiver Keys, (b) exakter Token-Substring überall, (c) konfigurierte Auth-Header-Werte.
- **Boolesche Werte (R7):** Boolesche Konfigurationswerte werden **strikt** geparst nach dem Go-Äquivalent zu `strconv.ParseBool` (akzeptiert `1, t, T, true, TRUE, True, 0, f, F, false, FALSE, False`); **jeder andere Wert ist ein Startfehler (Exit 3)**. Das ersetzt den TS-Vergleich `!== "true"` (T8).
- **Begründung:** Die TS-Redaktion griff nur auf Query-Keys (S4); ein Token im Pfad bliebe unredigiert. Fail-fast verhindert den Betrieb mit still deaktivierten Writes (T8) und mit nicht neu geladener Konfiguration (T7).
- **Konsequenz:** Ungültige Konfiguration endet mit Exit-Code `3` (fehlende oder ungültige Pflichtkonfiguration, Bool-Parse-Fehler, `0600`-Verweigerung, ungültige `tools.json`); `config`-Fehler sind als `error_class` unterscheidbar.

### 5.11 Logging, Debugging, Observability

- **Entscheidung:** stdlib `log/slog` mit `JSONHandler` auf **stderr**; **stdout ausschließlich für das MCP-stdio-Protokoll**. Level `error|warn|info|debug` (Default `info`) über Flag/Env. Felder: `ts`, `level`, `msg`, `tool`, `method`, `url` (sanitisiert), `status`, `duration_ms`, `attempt`, `error_class`. Bodies nur im Debug-Level und nur mit explizitem Opt-in; die Redaktion bleibt dabei aktiv. Keine Metriken, kein Tracing.
- **Begründung:** Der TS-Bestand loggte bereits auf stderr (kein stdio-Konflikt), aber mit unvollständiger Redaktion (S4). `slog` ist stdlib und deckt den Bedarf ohne Dependency.
- **Revisit-Trigger:** Metriken oder Tracing erst bei nachgewiesenem Betriebsbedarf (z. B. Remote-Betrieb).

### 5.12 Teststrategie und Test-Doubles

- **Entscheidung (Architektur):** HTTP-Tests über `net/http/httptest`; ein minimales, beim Konsumenten definiertes `Doer`-Interface (erfüllt von `*http.Client`) für Fakes; MCP-Protokolltests über das In-Memory-Transportpaar des SDK; keine externen Live-APIs. Details in Abschnitt 10.
- **Begründung:** Der TS-Bestand hatte nur einen Smoke-Test und keine Unit-Tests der Kernlogik (Abschnitt 3.4). Ein konsumentendefiniertes Interface hält `internal/httpx` frei von Test-Framework-Kopplung.

### 5.13 Rückbau des TypeScript-Bestands

- **Entscheidung:** Der Rückbau erfolgt erst in der letzten Migrationsphase nach bestandener Definition of Done, atomar auf einem Feature-Branch. Die genaue Liste und die Guardrails stehen in Abschnitt 9/10/12.
- **Begründung:** Solange die Migration nicht verifiziert ist, bleibt der TS-Bestand als Referenz und Rollback-Option erhalten.

---

## 6. Entscheidungsmatrix für Go-MCP-SDK und MCP-Transport

Bewertungsstand 2026-09-18; Grundlage ist die korrigierte, zitierfähige SDK-Evidenz (Evidenz C, `lib-1`). Die Spalte „Confidence" bezieht sich auf die jeweilige Tabellenzeile.

### 6.1 Vergleich der bewerteten Bibliotheken

| Dimension | `modelcontextprotocol/go-sdk` | `mark3labs/mcp-go` | `metoro-io/mcp-golang` | `ThinkInAIXYZ/go-mcp` | Confidence |
|---|---|---|---|---|---|
| Wartungsstatus | first-party, nahezu täglich; 128 Commits/3 Mon., letzter 2026-09-18 | aktive Community; 50 Commits/3 Mon., letzter 2026-09-15 | 0 Commits/3 Mon., letzter 2025-09-02 → effektiv tot | 9 Commits/3 Mon.; niedrige Aktivität | verified (alle) |
| Protokollabdeckung | alle 5 Revisionen inkl. `2026-07-28` (Default) | `2024-11-05` … `2026-07-28` | UNVERIFIED (keine Versionskonstanten) | nur `2024-11-05` + `2025-03-26` (`protocol/types.go`) | verified (go-sdk, mark3labs); verified-limitiert (ThinkInAI); unverified (metoro) |
| Transportunterstützung | Stdio, SSE, Streamable HTTP, In-Memory | Stdio, SSE, Streamable HTTP, In-Process | Stdio, HTTP, SSE, Gin | Stdio, SSE (Streamable HTTP unbestätigt) | verified (go-sdk, mark3labs, metoro); unverified (ThinkInAI Streamable HTTP) |
| API-Stabilität | v1.x seit 2026-05-08; Release v1.8.0 (2026-09-14) | v1.x erst seit 2026-09-02 (16 Tage); Release v1.1.0 | v0.x (stale); Release v0.16.1 | v0.x; Release v0.2.29 | verified |
| Testbarkeit | `mcp.NewInMemoryTransports()` | `client.NewInProcessClient(server)` | nur Custom-IO | nicht gefunden | verified (go-sdk, mark3labs); unverified (ThinkInAI) |
| Lizenz | Apache-2.0 (neuer Code) + MIT (Altbeiträge), CC-BY-4.0 (Docs) | MIT | MIT | MIT | verified (Quellen vollständig) |
| Min. Go | 1.25.0 | 1.25.5 | 1.21 | UNVERIFIED | verified (außer ThinkInAI) |
| Offene Issues | 56 (aktiv triagiert) | 11 | 28 (unbearbeitet) | 7 | verified (alle) |
| Integrationsaufwand | niedrig–mittel: stabile v1-API, stdio + In-Memory | mittel: junge v1-API, Spec-Lücke #928 (SEP-2575), stdio-Deadlock #976 | hoch: stale, Pre-`2026-07-28` | hoch: Kernfeatures unbestätigt | abgeleitet aus Wartung und Reifegrad |

### 6.2 Standardempfehlung

**`github.com/modelcontextprotocol/go-sdk` v1.8.0** ist die einzige Standardempfehlung. Ausschlaggebend sind: Referenzimplementierung mit vollständigster Protokollabdeckung (alle fünf Revisionen inkl. `2026-07-28`), In-Memory-Transportpaar als bester Testpfad, höchste Velocity, stabile v1-API seit 2026-05-08 und die Standard-OSS-Lizenz Apache-2.0/MIT (nicht „custom"). Die Lizenzangabe der früheren Evidenz war falsch und ist korrigiert.

### 6.3 Verworfene Alternativen

| Bibliothek | Ausschlussgrund | Einordnung |
|---|---|---|
| `mark3labs/mcp-go` | erst 16 Tage in v1.x (seit 2026-09-02), offene Spec-Lücke #928 (SEP-2575), stdio-Deadlock-Risiko #976 | Fallback, falls das offizielle SDK einen Blocker zeigt |
| `metoro-io/mcp-golang` | 0 Commits in 7 Monaten, 28 unbearbeitete Issues, Pre-`2026-07-28`, v0.x | verworfen |
| `ThinkInAIXYZ/go-mcp` | nur Protokollrevisionen bis `2025-03-26`, Streamable HTTP und In-Memory-Test unbestätigt, Min-Go unbestätigt | verworfen |

### 6.4 Verifikationspunkte

- #499 — Goroutine-Leak im Session-Cleanup: auf Relevanz für die stdio-only-Nutzung prüfen.
- #1262 — SSE-Write-Timeout: nur relevant, falls ein Netz-Transport aufgenommen wird; für v0.1.0 dennoch einordnen.
- Die **structured-Output- und `isError`-Unterstützung des SDK** (Grundlage der Rückgabe-/Fehlerstrategie aus 5.7) ist gegen die SDK-Doku zu verifizieren.
- Exakte Registrierungs- und Handler-Signaturen des SDK vor Migrations-Phase 4 gegen die Doku verifizieren; die Evidenz belegt Protokollrevisionen und Transports, nicht die konkreten Funktionssignaturen.

### 6.5 Transportmatrix

| Transport | SDK-Unterstützung | Ziel-Status v0.1.0 | Begründung |
|---|---|---|---|
| stdio | ja | **unterstützt** (Produktionsweg) | lokal ausgeführter CLI-Prozess mit Request/Response pro Tool-Aufruf; keine Netz-Exposition |
| In-Memory | ja (`mcp.NewInMemoryTransports()`) | **nur Tests** | schnellster Protokolltest ohne Kindprozess; kein Produktionsweg |
| SSE | ja (`SSEHTTPHandler`) | **bewusst ausgeschlossen** | erhöht Angriffsfläche und Scope (HTTP-Auth, Sessions, CORS, TLS) ohne aktuellen Bedarf |
| Streamable HTTP | ja (`StreamableHTTPHandler`) | **bewusst ausgeschlossen** | wie SSE; Revisit-Trigger: Remote-/Mehrbenutzerbetrieb |

---

## 7. Ziel-Projektlayout als Verzeichnisbaum ohne Code

Der Baum zeigt die Zielstruktur; die Packages sind an den Verantwortlichkeiten aus Abschnitt 5.2 geschnitten.

```text
.
├── go.mod
├── go.sum
├── LICENSE
├── README.md
├── examples/
│   └── hexnode.tools.json
├── cmd/
│   └── api2mcp/
│       └── main.go
└── internal/
    ├── cli/
    ├── config/
    ├── mcp/
    ├── tools/
    ├── httpx/
    ├── devtools/
    └── logging/
```

| Datei/Package | Verantwortung | Übernommener TS-Bestand | Wichtigste Abhängigkeitsrichtung |
|---|---|---|---|
| `cmd/api2mcp/main.go` | Wiring, Signal-Handling, Exit-Codes | `src/server.ts:156` (`connect(StdioTransport)`) | importiert `internal/*`; sonst nichts |
| `internal/cli` | Subcommand-Dispatcher, Merge von Flags/Env/Config, Exit-Codes, Version/Build-Metadaten | Version/Build-Metadaten sind neu (kein TS-Äquivalent) | → `config`, `logging`; stößt `mcp`/`devtools` an |
| `internal/config` | Konfigurationsmodell, Quellenpriorität, striktes JSON-Decoding, Validierung, striktes Bool-Parsing | `src/server.ts:10-20` (Env-Lesen, `process.exit(1)`) | nur stdlib; liefert Datenmodell |
| `internal/mcp` | MCP-SDK-Adapter, McpServer-Instanz, Tool-Registrierung, Handler | `src/server.ts:109` (McpServer-Instanz) und die Registrierung der Tools | → `tools`, `httpx`, `logging` |
| `internal/tools` | Kern-Tools, Eingabe-/Ausgabeschemas, `tools.json`-Modell/-Laden/strikte Validierung, dynamische Tool-Definitionen | `src/server.ts:104-107` (Zod-Input-Schemas), `:111-153` (5 Core-Handler), `:136,143,150` (Guarded-Gate), `:158-187` (`tools.json` + dynamische Tool-Definitionen) | → `httpx`, `logging` |
| `internal/httpx` | HTTP-Client, Auth, Retry, Timeout, Redirects, Response-Limits, URL-Sanitisierung; `joinUrl`/`isAbsoluteUrl`, `parseRetryAfter`, `HttpError`, `qs`, `retry`/`sleep`/`RetryOptions` | `src/server.ts:22-28`, `:48-53`, `:55`; `src/lib/qs.ts`; `src/lib/retry.ts` | nur stdlib; kennt weder CLI noch MCP |
| `internal/devtools` | Devzeit-Helfer: Discovery/Probe, OAuth2, adaptives Pacing (Delay steigt bei 429, sinkt bei Erfolg — `scripts/scan_wordlist.ts:79-87`), ausdrücklich verschieden vom `httpx`-Retry; **nicht** Teil des `serve`-Pfads | `discover_openapi.ts`, `scan_wordlist.ts`, `probe_get.ts`, `validate_endpoints.ts`, `inventory_api.ts`, `openapi_to_tools.ts`, `scan_to_tools.ts`, `oauth2_client.ts`, `oauth2_device.ts` | → `httpx`, `logging` |
| `internal/logging` | `slog`-Aufbau, Redaktion, stderr-Sink | `src/lib/logger.ts` (`logRequest`/`redact`/`time`) | nur stdlib |
| (entfernt) | entfällt | `scripts/_load_env.ts` → **entfernt**, ersetzt durch die Konfigurationspriorität aus 5.3 | — |
| (Test) | Go-`testing` mit In-Memory-Transport | `test/server.smoke.test.ts` | — |
| (Format) | bleibt Format-Contract | `examples/hexnode.tools.json` | — |

**Abhängigkeitsregel:** `cmd` → `internal/*`; die sieben `internal`-Packages (`cli`, `config`, `mcp`, `tools`, `httpx`, `devtools`, `logging`) importieren einander nur in einer Richtung, Zyklen sind ausgeschlossen. `tools` enthält Kern-Tools **und** das `tools.json`-Modell/-Laden; `devtools` **schreibt** `tools.json`, `tools` **liest** es — Datenfluss, **keine** Code-Abhängigkeit. `httpx` und `logging` bleiben stdlib-only; `httpx` kennt weder CLI noch MCP und ist damit unabhängig testbar.

---

## 8. Tabelle: TypeScript-Altbestand → Go-Zielverantwortlichkeit → Breaking Change

Die Matrix führt die relevanten Verhaltensbereiche des TypeScript-Bestands auf die Go-Zielkomponente über und trennt sauber zwischen übernommenem, neu gestaltetem und entferntem Verhalten. Ein Bruch ist jede Änderung, die bestehende Client-Konfigurationen, Tool-Aufrufe, Env-Namen oder Dev-Workflows betrifft; „kein Bruch" bedeutet ausdrücklich, dass das öffentliche Verhalten unverändert bleibt. Brüche sind bewusst und begründet, nicht Kollateral.

| Bestehende Datei/Komponente | Bisherige Verantwortung und öffentliches Verhalten | Zielkomponente (Go) | Entscheidung (übernehmen / neu gestalten / entfernen) | Exakter Breaking Change | Fachliche/technische Begründung | Migrationsauswirkung für Nutzer | Test-/Akzeptanzkriterium |
|---|---|---|---|---|---|---|---|
| `src/server.ts:104-107` (Tool-Registrierung) | 5 Core-Tools unter `api_get`, `api_post`, `api_put`, `api_delete`, `api_probe` mit verbatim Beschreibungen | `internal/tools` | übernehmen | **keiner** | Tool-Namen sind MCP-Client-Identität (Abschnitt 5.7); ein Bruch hätte keinen technischen Nutzen | bestehende Aufrufe funktionieren unverändert | `tools/list` enthält exakt diese 5 Namen |
| `src/server.ts:104-107` (Zod-`.shape`-Schemas), `:59` | Eingaben über `.shape`; `payload` beliebiger JSON-Wert; unbekannte Felder unvalidiert; `Content-Type: application/json` immer gesetzt | `internal/tools` | neu gestalten | Schemas auf Go-Typen umgestellt; `payload` nur bei Schreib-Tools; `Content-Type` nur mit Body; unbekannte Felder = Fehler | behebt T9 und die fehlende Schema-Validierung (F4) | Clients müssen Eingaben an das neue Schema anpassen | Schema-Validierungstests je Tool; Test „kein Content-Type ohne Body" |
| `src/server.ts:126,169` (Rückgabe als `resource`/`uri`) | Erfolg liefert `resource.uri` mit der vollständigen, credentialtragenden URL; `mimeType: application/json` | `internal/tools`, `internal/mcp` | neu gestalten | `resource`/`uri` entfällt; `content:[{type:"text",…}]` plus `structuredContent`; sanitisierte URL | behebt den Secret-Leak S1 | Clients, die `resource.uri` lasen, müssen auf `text`/`structuredContent` wechseln | Antwortformtest; Test „kein Token in der Response" |
| `src/server.ts` (Handler-Würfe), `:79` | Fehler propagierten als Exception zum JSON-RPC-Fehler; leere Nicht-JSON-Antwort → `undefined as any` | `internal/tools`, `internal/mcp` | neu gestalten | erwartbare Fehler als Tool-Ergebnis mit `isError: true` und `error_class`; nur Protokollmissbrauch bleibt Protokollfehler | behebt T2 und die fehlende Fehlersystematik (Abschnitte 5.7/5.9) | Clients müssen `isError` und `error_class` auswerten | Negativtests je `error_class` |
| `package.json:12` (`start`), `src/server.ts:10-20` | Start via `node dist/server.js`; `API_BASE` Pflicht, sonst `process.exit(1)`; kein Subcommand | `internal/cli`, `cmd/api2mcp` | neu gestalten | Start via `api2mcp serve`; Subcommands `serve`/`discover`/`oauth2`/`version`; dokumentierte Exit-Codes | Abschnitt 5.3 | Startbefehl und Client-Konfiguration müssen geändert werden | CLI-Tests für Subcommands und Exit-Codes |
| `src/server.ts:10-16` (Env-Lesen) | sieben Env-Variablen mit generischen Namen, einmalig bei Modul-Load | `internal/config` | neu gestalten | Namensraum `API2MCP_*`; Priorität Flags > Env > JSON > Defaults; kein Alias | Abschnitt 5.3 (Kollision mit Env-Variablen der Ziel-API) | Betreiber müssen alle Variablen umbenennen (Mapping unten) | Prioritäts- und Mapping-Tests |
| `src/server.ts:87`, `src/lib/retry.ts` | Retry nur GET, additiver Jitter (`:23-25`), Status 429/502/503/504; kein Timeout, kein Cancel | `internal/httpx` | neu gestalten | GET/HEAD; Full Jitter mit `max_delay`; Timeout pro Versuch plus Gesamtbudget; echte Cancellation | behebt F1/F2; bewusste Semantikänderung (Abschnitt 5.9) | Wartezeiten und Abbruchverhalten ändern sich | deterministische Retry-/Timeout-/Cancel-Tests |
| `src/lib/logger.ts` | JSON auf stderr mit `{tool,method,url,status,ms}`; Redaktion nur Query-Keys (`:22`) | `internal/logging` | neu gestalten | **Format-Bruch**: Felder `ts,level,msg,tool,method,url,status,duration_ms,attempt,error_class`; Redaktion additiv um Token-Substring und Auth-Header-Werte | behebt S4 | Log-Parser und Alerting müssen angepasst werden | Feld- und Redaktions-Tests (Sentinel-Token) |
| `README.md` | Dokumentation der Tools, Env-Variablen und Scripts, teils divergierend | `README.md` (Go-Neufassung) | neu gestalten | vollständige Neufassung (CLI-Referenz, Exit-Codes, Env-Mapping, Migrationsnotiz) | Abschnitte 5.3/8; Bestand war bereits divergent (F6) | Nutzer brauchen die neue Doku | README-Checkliste: alle Subcommands/Env/Exit-Codes |
| `examples/hexnode.tools.json` | Format-Contract für dynamische Tools: `name`, `description`, `method`, `pathTemplate`, `pathParams`, `queryParams`, `hasBody`, `guarded`, `generatedAt` | `internal/tools` | übernehmen | **keiner** (Format) | Bewahrung generierter Artefakte (Abschnitt 5.8) | bestehende Datei bleibt nutzbar | Beispieldatei validiert gegen das strikte Schema; Round-Trip-Test |
| `src/server.ts:160-187` (`tools.json`-Laden) | `pathParams`/`queryParams`/`hasBody` ignoriert; keine Validierung; Registrierung nach `connect()` (`:156`); stilles `catch {}` (`:187`) | `internal/tools`, `internal/mcp` | neu gestalten | strikte Validierung; alle Felder ausgewertet; fehlender Pfadparameter = Fehler; Registrierung vor `connect()` | behebt F3/F4 sowie T3/T4 | fehlerhafte `tools.json` verhindert jetzt den Start | Validierungs- und Race-Tests |
| `src/server.ts:156`, `package.json:2` | MCP-Servername `any-api-mcp`; Transport `StdioServerTransport` | `internal/mcp`, `cmd/api2mcp` | übernehmen | **keiner** | Client-Identität und lokaler Transport bleiben (Abschnitte 5.1/5.5) | keine | Handshake-Test über stdio |
| `scripts/oauth2_client.ts`, `scripts/oauth2_device.ts` (`writeEnv`) | OAuth2-Token wurden in `.env.local` geschrieben | `internal/devtools` | neu gestalten | kein Schreiben von `.env`-Dateien mehr; Token-Ablage über Env oder Konfigurationsdatei (Abschnitt 5.10) | Abschnitte 5.3/5.10 (Secret-Handling) | `npm run oauth2:*` und `.env.local` entfallen | OAuth2-Tests ohne `.env`-Schreibzugriff |
| `test/server.smoke.test.ts` | spawnt Kindprozess; prüft Handshake und die 5 Tool-Namen | Go-`testing` (In-Memory-Transport) | neu gestalten | Dev-Workflow-Bruch: kein `npm test`, kein Kindprozess | F5; In-Memory-Transport besser testbar (Abschnitt 6.1) | Entwickler nutzen `go test ./...` | Protokolltest-Suite grün |
| `package.json:9-23` (Scripts), `.github/workflows/ci.yml` | `npm ci`/`build`/`test`/`dev` als Dev- und Build-Workflow | Go-Workflows | neu gestalten | `go build`/`go test`/`gofmt` statt npm; Node-Workflow entfällt in Phase 10 | Abschnitt 10.8 | Entwickler-Workflow ändert sich | dokumentierter Go-Workflow |
| `scripts/_load_env.ts` | lud `.env.local` in `process.env` | — | entfernen | `.env.local` wird nicht mehr automatisch geladen | ersetzt durch die Priorität aus Abschnitt 5.3 | Nutzer müssen Env/Config explizit setzen | Konfigurationstest ohne `.env.local` |
| `scripts/discover_openapi.ts`, `scan_wordlist.ts`, `probe_get.ts`, `validate_endpoints.ts`, `inventory_api.ts`, `openapi_to_tools.ts`, `scan_to_tools.ts` | Discovery/Probe/Scan über npm-Scripts, eigene Env-Namen, duplizierte Helfer | `internal/devtools` | neu gestalten | Aufruf über `api2mcp discover`/`api2mcp oauth2`; Flags statt Env; adaptives Pacing | T13/T14; Paketkonsolidierung (Abschnitt 5.2) | Script-Aufrufe und Env-Namen ändern sich | devtools-Tests inklusive Pacing |
| `LICENSE` | MIT, Holder „Gene Hively", 2026 | `LICENSE` (unverändert) | übernehmen | **keiner** | Lizenz bleibt unverändert | keine | Datei unverändert vorhanden |
| `src/server.ts:44-46` (`basic`-Auth) | TS erwartete bereits base64-kodierte Zugangsdaten in `AUTH_TOKEN` und setzte sie unverändert als `Authorization: Basic …` | `internal/httpx` | neu gestalten | **Bruch**: `AUTH_TOKEN`/`API2MCP_AUTH_TOKEN` enthält künftig **rohes `user:password`**; die Base64-Kodierung übernimmt der Client | Abschnitt 5.9; konsistentes Secret-Handling statt Vor-Kodierung durch den Nutzer | bestehende base64-Werte müssen auf die rohe Form umgestellt werden | Test für `basic` mit rohem `user:password` |
| `src/server.ts:77-80` (Antwortverarbeitung) | Antwortgröße war unbegrenzt; der Body wurde vollständig gelesen | `internal/httpx` | neu (bewusst hinzugefügt) | **Neuheit/Verhaltensbruch**: Antworten über `max_response_bytes` (Default 10 MiB) schlagen mit `error_class: response_too_large` fehl | Abschnitt 5.9; verhindert unbegrenzten Speicherverbrauch | Nutzer müssen das Limit bei Bedarf konfigurieren | Test mit überschrittenem Limit |
| `src/server.ts:65` (`fetch`) | Es galt das Redirect-Default der Laufzeit; Credentials konnten bei Host-Wechsel mitgehen | `internal/httpx` | neu gestalten | **Bruch**: maximal 5 Hops, nur `http`/`https`, **keine Weitergabe von Credentials bei Host-Wechsel** | Abschnitt 5.9; verhindert Auth-Leak über Redirects | Nutzer müssen das Redirect-Verhalten ihrer APIs prüfen | Cross-Host-Redirect-Test mit Credential-Stripping |
| `—` (neu, Abschnitt 5.10) | Eine Konfigurationsdatei mit Secret konnte beliebig berechtigt sein | `internal/config` | neu (bewusst hinzugefügt) | **Neuheit/Verhaltensbruch**: eine weiter als `0600` berechtigte Konfigurationsdatei mit Secret verhindert den Start | Abschnitt 5.10; prüfbare Sicherheitseigenschaft | Nutzer müssen `chmod 600` setzen | Test mit zu offen berechtigter Datei |
| `src/server.ts:15` (`ALLOW_DESTRUCTIVE`) | Alles außer exakt `"true"` galt stillschweigend als `false` | `internal/config` | neu gestalten | **Bruch**: nur die `strconv.ParseBool`-Werte sind gültig; jeder andere Wert bricht den Start (Exit 3) | Abschnitt 5.10; ersetzt den String-Vergleich (T8) | Nutzer müssen ihre Konfigurationswerte prüfen | table-driven Bool-Parsing-Test |
| `tsconfig.json` | TypeScript-Compiler-Konfiguration (Target, Module, `rootDir`/`outDir`) | — | entfernen | entfällt vollständig in Phase 10 | Go-Build ersetzt `tsc` (Abschnitt 9.10) | kein TypeScript-Build mehr | Entsorgungs-Checkliste Phase 10 |
| `package-lock.json` | npm-Lockfile (`lockfileVersion` 3) | — | entfernen | entfällt vollständig in Phase 10 | npm wird nicht mehr verwendet (Abschnitt 9.10) | kein `npm ci` mehr | Entsorgungs-Checkliste Phase 10 |
| `dist/` | Build-Artefakt aus `tsc` | — | entfernen | entfällt; das Go-Build-Artefakt tritt an seine Stelle | generierter Output, nicht versioniert (Abschnitt 9.10) | Start nicht mehr über `dist/server.js` | Entsorgungs-Checkliste Phase 10 |
| `src/lib/qs.ts` | `qs()` filtert `undefined`/`null`/leeren String aus der Query | `internal/httpx` | übernehmen | **keiner** | bewährtes, erwartetes Filterverhalten (Abschnitt 3.2) | keine | Unit-Tests für Query-Filterung |

### 8.1 Mapping der Konfigurationsnamen (ohne Alias-Unterstützung)

| Altname (TypeScript) | Neuname (Go) | Status |
|---|---|---|
| `API_BASE` | `API2MCP_BASE_URL` | ersetzt, kein Alias |
| `AUTH_MODE` | `API2MCP_AUTH_MODE` | ersetzt, kein Alias |
| `AUTH_TOKEN` | `API2MCP_AUTH_TOKEN` | ersetzt, kein Alias |
| `AUTH_HEADER` | `API2MCP_AUTH_HEADER` | ersetzt, kein Alias |
| `AUTH_QUERY_KEY` | `API2MCP_AUTH_QUERY_KEY` | ersetzt, kein Alias |
| `ALLOW_DESTRUCTIVE` | `API2MCP_ALLOW_DESTRUCTIVE` | ersetzt, kein Alias; striktes Bool-Parsing (Abschnitt 5.10) |
| `TOOLS_FILE` | `API2MCP_TOOLS_FILE` bzw. `--tools-file` der Generatoren | ersetzt, kein Alias |
| — (neu) | `API2MCP_CONFIG` (Pfad zur JSON-Konfigurationsdatei) | neu (Abschnitt 5.3) |
| `PROBE_DELAY_MS` | `api2mcp discover --pacing-delay-ms` | ersetzt, kein Alias |
| `PROBE_PATHS` | `api2mcp discover --paths` | ersetzt, kein Alias |
| `OUTPUT` | `api2mcp discover --output` | ersetzt, kein Alias |
| `OUTPUT_DIR` | `api2mcp discover --output-dir` | ersetzt, kein Alias |
| `WORDLIST` | `api2mcp discover --wordlist` | ersetzt, kein Alias |
| `OPENAPI_FILE` | `api2mcp discover --openapi-file` | ersetzt, kein Alias |
| `SCAN_FILE` | `api2mcp discover --scan-file` | ersetzt, kein Alias |
| `TOKEN_URL` | `api2mcp oauth2 --token-url` | ersetzt, kein Alias |
| `CLIENT_ID` | `api2mcp oauth2 --client-id` | ersetzt, kein Alias |
| `CLIENT_SECRET` | `API2MCP_CLIENT_SECRET` (Env oder Datei) | ersetzt, kein Alias; **niemals** per Flag (Abschnitt 5.3) |
| `SCOPE` | `api2mcp oauth2 --scope` | ersetzt, kein Alias |
| `DEVICE_AUTH_URL` | `api2mcp oauth2 --device-auth-url` | ersetzt, kein Alias |
| `OUTPUT_ENV` | — | entfällt mit dem Script (kein `.env`-Schreiben mehr, Abschnitt 5.10) |

### 8.2 Ausdrücklich kein Bruch

- Tool-Namen `api_get`, `api_post`, `api_put`, `api_delete`, `api_probe`.
- MCP-Servername `any-api-mcp` und Transport `stdio`.
- Feldformat von `tools.json` und `examples/hexnode.tools.json`.
- `LICENSE` (MIT).

### 8.3 Brüche, die eine Migrationsnotiz brauchen

Parametrisches Eingabeschema, Antwortformat (`text`/`structuredContent`), Fehlerformat (`isError`/`error_class`), CLI-Start und Subcommands, Env-Namensraum, Retry-/Timeout-Semantik, Log-Format, `README`, Entfall der Node-/TypeScript-Artefakte, Validierungs-/Registrierungssemantik der dynamischen Tools, `.env.local`-Persistenz, Test- und Build-Workflow, `scripts/_load_env.ts` sowie die Dev-Scripts. Zusätzlich: `basic`-Auth mit rohem `user:password`, das neue `max_response_bytes`-Limit, die Redirect-Policy, die `0600`-Verweigerung bei Datei-Secrets und das strikte Bool-Parsing. Vollständige Liste und Nutzerkommunikation: **Migrationsphase 9** (Abschnitt 9.9).

---

## 9. Detaillierter Phasenplan mit Akzeptanzkriterien

Zehn Phasen. Jede Phase ist unabhängig abnehmbar; der abnehmbare Zwischenstand steht jeweils im Akzeptanzkriterium. Der TypeScript-Bestand bleibt in den Phasen 2–9 unverändert und wird ausschließlich in Phase 10 entfernt.

**Zerlegungskonvention (plan.md Z. 222):** Ein Milestone entspricht einer Migrationsphase; je Aufgabengruppe entsteht ein Epic; je Akzeptanzkriterium-Cluster ein Issue; ein Definition-of-Done-Kriterium ist ein Akzeptanzkriterium.

| Migrationsphase | Milestone-Vorschlag | Epic-Vorschläge (Titel) | Done-Kriterium | Issue-Konvention |
|---|---|---|---|---|
| 9.1 Baseline-Audit und Zielvertragsdefinition | `baseline-and-target-contract` | `baseline-audit`, `target-contract` | Abschnitte 2–8 vollständig und belegt | ein Issue je Befundgruppe (S, T, F) |
| 9.2 Initialisierung des Go-Moduls und Ziel-Projektlayouts | `go-module-scaffold` | `go-module-init`, `package-layout` | `go build ./...` grün; Layout entspricht Abschnitt 7 | ein Issue je Package-Gerüst |
| 9.3 Konfigurationsmodell, CLI und Prozess-Lifecycle | `config-and-cli` | `config-model`, `cli-dispatcher`, `process-lifecycle` | Prioritäts-, Bool- und `0600`-Tests grün; Exit-Codes dokumentiert | ein Issue je Konfigurationsquelle und je Subcommand |
| 9.4 MCP-Server, SDK-Integration und gewählter Transport | `mcp-server-stdio` | `sdk-verification`, `stdio-adapter`, `in-memory-harness` | Handshake über stdio und In-Memory; Verifikationspunkte eingeordnet | ein Issue je Verifikationspunkt (#499, #1262, Signaturen, `isError`) |
| 9.5 Öffentliche MCP-Tools und Eingabe-/Ausgabemodell | `core-tools` | `tool-schemas`, `response-model`, `error-model` | `tools/list` mit 5 Namen; Schema-/Antwort-/Fehlerformtests grün | ein Issue je Tool und je Antwort-/Fehleraspekt |
| 9.6 HTTP-Integration, Authentifizierung und Response-Normalisierung | `http-client` | `request-building`, `auth-modes`, `response-normalization` | `httptest`-Tests für alle Auth-Modi, Redirects und Limit grün | ein Issue je Auth-Modus und je Normalisierungsschritt |
| 9.7 Fehlerbehandlung, Retry, Timeouts, Cancellation und Logging | `error-retry-timeout` | `error-classification`, `retry-backoff`, `timeout-cancel`, `logging-redaction` | deterministische Retry-/Timeout-/Cancel-Tests; Redaktion nachgewiesen | ein Issue je Fehlerklasse und je Redaktionsregel |
| 9.8 Testdesign, Testumgebung und Qualitäts-Gates | `test-harness` | `test-suite`, `quality-gates` | `go test ./...` grün; alle Gates erfüllt | ein Issue je Testart und je Gate |
| 9.9 README, CLI-Referenz, Beispiele und Breaking-Change-Migrationsnotiz | `docs-and-migration-note` | `readme-rewrite`, `cli-reference`, `migration-note` | README und Migrationsnotiz decken Abschnitt 8 ab | ein Issue je Dokumentationsartefakt |
| 9.10 Verifikation der Definition of Done und Entsorgung des TypeScript-Altbestands | `ts-removal` | `dod-verification`, `ts-cleanup` | DoD erfüllt; TS-Artefakte entfernt; Build/Test grün | ein Issue je Entsorgungspaket |

### 9.1 Baseline-Audit und Zielvertragsdefinition

- **Ziel:** Auditierter Ist-Stand und verbindlicher Zielvertrag; im Wesentlichen **abgeschlossen durch das Plan-Dokument**, Nachweis = Abschnitte 2–8.
- **Voraussetzungen/Abhängigkeiten:** keine.
- **Verzeichnisse/Dateien:** `docs/go-migration-plan.md` (dieses Dokument); keine Projektdatei wird geändert.
- **Fachliche und technische Aufgaben:** Prüfstand-Commit verifizieren, HEAD/`origin/main`-Abgleich, CRLF/LF-Sachverhalt klären, Befunde S1–S5/T1–T14/F1–F6 erheben, Zielbild (5), SDK-/Transportentscheidung (6), Layout (7) und Breaking-Change-Matrix (8) festschreiben.
- **Vor Abschluss zu treffende Entscheidungen:** SDK und Transport (bereits in 5.4/6.2 getroffen); Gültigkeit der Abweichungsregel (in Abschnitt 2 geklärt).
- **Hauptrisiken und konkrete Gegenmaßnahmen:** veraltete Evidenz → Prüfstand-Commit fixieren; untracked Artefakte verwechseln → Baseline explizit abgrenzen (2.4).
- **Objektiv prüfbare Akzeptanzkriterien:** Abschnitte 2–8 vollständig; jeder Befund mit ID und `datei:zeile`; Prüfstand reproduzierbar. **Abnehmbarer Zwischenstand:** das Plan-Dokument selbst.
- **Ergebnisartefakte:** Plan-Dokument Abschnitte 2–8.

### 9.2 Initialisierung des Go-Moduls und Ziel-Projektlayouts

- **Ziel:** Kompilierendes Go-Modul mit dem Layout aus Abschnitt 7 und einem leeren `api2mcp`-Binary.
- **Voraussetzungen/Abhängigkeiten:** 9.1.
- **Verzeichnisse/Dateien:** anzulegen `go.mod`, `go.sum`, `cmd/api2mcp/main.go` sowie `internal/{cli,config,mcp,tools,httpx,devtools,logging}`; `LICENSE` und `examples/hexnode.tools.json` unverändert übernehmen.
- **Fachliche und technische Aufgaben:** Modulpfad `github.com/sstreichan/api2mcp` setzen, Go-Minimum 1.25, SDK-Dependency v1.8.0 aufnehmen, Package-Grenzen gemäß Abschnitt 7 anlegen.
- **Vor Abschluss zu treffende Entscheidungen:** exakter Dependency-Pin (v1.8.0 aus 5.4); Zuschnitt der sieben Packages.
- **Hauptrisiken und konkrete Gegenmaßnahmen:** Paketgrenzen zu grob/zu fein → Abschnitt 7 als verbindlich; Dependency-Drift → gepinnte Version.
- **Objektiv prüfbare Akzeptanzkriterien:** `go build ./...` erfolgreich; Verzeichnisbaum entspricht Abschnitt 7 (genau sieben `internal`-Packages). **Abnehmbarer Zwischenstand:** kompilierendes, noch funktionsloses CLI.
- **Ergebnisartefakte:** `go.mod`, `go.sum`, Package-Gerüst, Layout-Nachweis.

### 9.3 Konfigurationsmodell, CLI und Prozess-Lifecycle

- **Ziel:** Validierte Konfiguration mit deterministischer Priorität, Subcommands und dokumentierten Exit-Codes.
- **Voraussetzungen/Abhängigkeiten:** 9.2.
- **Verzeichnisse/Dateien:** `internal/cli`, `internal/config`, `cmd/api2mcp/main.go`.
- **Fachliche und technische Aufgaben:** Quellenpriorität pro Feld (Flags > Env > JSON > Defaults), striktes JSON-Decoding, striktes Bool-Parsing, `0600`-Verweigerung bei Datei-Secrets, Subcommands `serve`/`discover`/`oauth2`/`version`, Exit-Codes, Signal-Handling (T11).
- **Vor Abschluss zu treffende Entscheidungen:** Prioritätsregel und Exit-Code-Tabelle (5.3/5.10); Umgang mit Konfigurationsdatei ohne Secrets.
- **Hauptrisiken und konkrete Gegenmaßnahmen:** Feldweise Priorität fehlerhaft → table-driven Konfigurationstests; Secrets in Shell-History → bewusst kein `--auth-token`.
- **Objektiv prüfbare Akzeptanzkriterien:** `api2mcp version` und `--help` laufen ohne gültige API-Konfiguration; Prioritäts-, Bool- und `0600`-Tests grün; **Bool-Fehlwert → Exit 3**. **Abnehmbarer Zwischenstand:** lauffähiges CLI mit validierter Konfiguration.
- **Ergebnisartefakte:** CLI-Referenz-Entwurf, Konfigurationsschema, Exit-Code-Liste.

### 9.4 MCP-Server, SDK-Integration und gewählter Transport

- **Ziel:** Laufender stdio-MCP-Server mit noch leerem Toolset und funktionierendem In-Memory-Testpfad.
- **Voraussetzungen/Abhängigkeiten:** 9.3.
- **Verzeichnisse/Dateien:** `internal/mcp`, `cmd/api2mcp/main.go`.
- **Fachliche und technische Aufgaben:** McpServer-Instanz, Stdio-Transport, `connect`, In-Memory-Transportpaar für Tests; **Verifikationspunkte aus Abschnitt 6.4 als Vorbedingung einlösen**: exakte SDK-Registrierungs-/Handler-Signaturen gegen die Doku prüfen, `isError`-/`structuredContent`-Unterstützung bestätigen, #499 und #1262 für stdio-only einordnen.
- **Vor Abschluss zu treffende Entscheidungen:** bestätigte SDK-Signaturen dokumentieren; Ergebnis der #499/#1262-Prüfung festhalten.
- **Hauptrisiken und konkrete Gegenmaßnahmen:** unerwartete API-Abweichung → früher Spike; Session-Cleanup-Leak (#499) → stdio-only prüfen.
- **Objektiv prüfbare Akzeptanzkriterien:** `initialize` und leeres `tools/list` funktionieren über stdio und über In-Memory; auf stdout erscheint ausschließlich Protokoll. **Abnehmbarer Zwischenstand:** handshake-fähiger Server.
- **Ergebnisartefakte:** SDK-Verifikationsnotiz, Testharness-Beschreibung.

### 9.5 Öffentliche MCP-Tools und Eingabe-/Ausgabemodell

- **Ziel:** Fünf registrierte Core-Tools mit neuem Eingabeschema, Rückgabe- und Fehlerformat.
- **Voraussetzungen/Abhängigkeiten:** 9.4.
- **Verzeichnisse/Dateien:** `internal/tools`, `internal/mcp`.
- **Fachliche und technische Aufgaben:** einheitliche Schemas, `api_probe` mit genau einem Request, Guarded-Gate, `content` + `structuredContent`, sanitisierte URL, `error_class` und `isError`.
- **Vor Abschluss zu treffende Entscheidungen:** exakte Feldnamen und Defaults (`method` = `GET`, `max_bytes` = 4096); Guarded-Semantik.
- **Hauptrisiken und konkrete Gegenmaßnahmen:** stiller Schema-Drift → Vertragstests; Verwechslung von `isError` und Protokollfehler → eigene Testfälle.
- **Objektiv prüfbare Akzeptanzkriterien:** `tools/list` nennt die fünf Namen; Schema-, Antwort- und Fehlerformtests bestanden. **Abnehmbarer Zwischenstand:** Tools mit Fake-HTTP aufrufbar.
- **Ergebnisartefakte:** Tool-Vertrag (Abschnitt 5.7), Testfallliste.

### 9.6 HTTP-Integration, Authentifizierung und Response-Normalisierung

- **Ziel:** Zentraler `httpx`-Client für Anfrageaufbau, Auth und Response-Normalisierung.
- **Voraussetzungen/Abhängigkeiten:** 9.5.
- **Verzeichnisse/Dateien:** `internal/httpx`.
- **Fachliche und technische Aufgaben:** URL-Join, Query-Serialisierung, Header-Reihenfolge (Nutzer zuerst, Auth gewinnt), Body/`Content-Type`-Regel, alle fünf Auth-Modi (inkl. `basic` mit rohem `user:password`), **Startwarnung bei `AUTH_MODE=query`** (Mitigation aus Abschnitt 5.9), Redirect-Policy mit Credential-Stripping bei Host-Wechsel, `max_response_bytes`-Limit, JSON-/Text-Normalisierung, URL-Sanitisierung.
- **Vor Abschluss zu treffende Entscheidungen:** Timeout- und Limit-Defaults (30 s, 10 MiB), Redirect-Maximum (5 Hops).
- **Hauptrisiken und konkrete Gegenmaßnahmen:** Auth-Leak in URL/Logs → zentrale Sanitisierung plus Tests; Redirect-Datenabfluss → Policy-Tests.
- **Objektiv prüfbare Akzeptanzkriterien:** `httptest`-Tests decken alle Auth-Modi, Redirects inkl. Stripping und Größenlimit ab; bei `AUTH_MODE=query` wird beim Start eine Warnung ausgegeben. **Abnehmbarer Zwischenstand:** vollständig getestetes `httpx`-Package ohne MCP-Bindung.
- **Ergebnisartefakte:** HTTP-Vertrag, Testmatrix.

### 9.7 Fehlerbehandlung, Retry, Timeouts, Cancellation und Logging

- **Ziel:** Stabile Fehlerklassifizierung, Retry/Backoff, Timeout, echte Cancellation und redigiertes Logging.
- **Voraussetzungen/Abhängigkeiten:** 9.6.
- **Verzeichnisse/Dateien:** `internal/httpx`, `internal/logging`.
- **Fachliche und technische Aufgaben:** `error_class`-Katalog, Full Jitter mit `max_delay`, `Retry-After` (Sekunden und HTTP-Datum), Timeout pro Versuch plus Gesamtbudget, `context`-Durchreichung, `slog`-Feldschema und Redaktion (Query-Keys, Token-Substring, Auth-Header-Werte).
- **Vor Abschluss zu treffende Entscheidungen:** endgültige Fehlerklassen und retrybare Status (429/502/503/504, 500 nicht); Timeout-Defaults.
- **Hauptrisiken und konkrete Gegenmaßnahmen:** flakige Retry-Tests → injizierte Clock/Sleep-Funktion; Secret-Reste in Logs → Sentinel-Token-Tests.
- **Objektiv prüfbare Akzeptanzkriterien:** deterministische Retry-/Timeout-/Cancel-Tests; Log-Felder und Redaktion nachgewiesen; kein Secret in Ausgabe. **Abnehmbarer Zwischenstand:** robuste `httpx`-/`logging`-Schicht.
- **Ergebnisartefakte:** Fehlerklassenkatalog, Log-Feldschema.

### 9.8 Testdesign, Testumgebung und Qualitäts-Gates

- **Ziel:** Umsetzung der Testpyramide und Gates aus Abschnitt 10.
- **Voraussetzungen/Abhängigkeiten:** 9.7.
- **Verzeichnisse/Dateien:** `*_test.go` in den betroffenen `internal`-Packages; Protokolltests über das In-Memory-Transportpaar.
- **Fachliche und technische Aufgaben:** Unit-, Integrations-, Protokoll-, Negativ-, Sicherheits- und Regressionstests gemäß Abschnitt 10; Gates `gofmt`, `go vet`, `staticcheck`, `go test -race`.
- **Vor Abschluss zu treffende Entscheidungen:** Begründung der statischen Analyse; Coverage-Gate gemäß Abschnitt 10.7.
- **Hauptrisiken und konkrete Gegenmaßnahmen:** Live-API-Abhängigkeit → verboten; Race-Conditions → `-race` als Gate.
- **Objektiv prüfbare Akzeptanzkriterien:** `go test ./...` grün; alle Gates dokumentiert und erfüllt. **Abnehmbarer Zwischenstand:** vollständige, reproduzierbare Testsuite.
- **Ergebnisartefakte:** Testplan (Abschnitt 10), Gate-Liste, Coverage-Report.

### 9.9 README, CLI-Referenz, Beispiele und Breaking-Change-Migrationsnotiz

- **Ziel:** Vollständige Dokumentation der Go-Version und explizite Migrationsnotiz aller Brüche.
- **Voraussetzungen/Abhängigkeiten:** 9.8.
- **Verzeichnisse/Dateien:** `README.md` neu geschrieben; `examples/hexnode.tools.json` behalten; Migrationsnotiz als eigener Abschnitt der Dokumentation.
- **Fachliche und technische Aufgaben:** CLI-Referenz, Env-Mapping (Abschnitt 8.1), Exit-Codes, Beispiele, Liste der Brüche (Abschnitt 8.3).
- **Vor Abschluss zu treffende Entscheidungen:** Ort und Form der Migrationsnotiz.
- **Hauptrisiken und konkrete Gegenmaßnahmen:** undokumentierte Brüche → Abschnitt 8 als Checkliste.
- **Objektiv prüfbare Akzeptanzkriterien:** README nennt alle Subcommands, Env-Namen, Mapping und Exit-Codes; Migrationsnotiz deckt Abschnitt 8.3 ab. **Abnehmbarer Zwischenstand:** vollständig dokumentierter Release-Kandidat.
- **Ergebnisartefakte:** `README.md`, CLI-Referenz, Migrationsnotiz.

### 9.10 Verifikation der Definition of Done und Entsorgung des TypeScript-Altbestands

- **Ziel:** Prüfung der Definition of Done (Abschnitt 13) und anschließende atomare Entsorgung des TypeScript-Bestands.
- **Voraussetzungen/Abhängigkeiten:** 9.1–9.9; die Go-Alternative erfüllt alle Qualitäts- und Abnahmekriterien.
- **Verzeichnisse/Dateien:** zu löschen ausschließlich hier (Repository): `package.json`, `package-lock.json`, `tsconfig.json`, `src/`, `test/`, `dist/`, `.github/workflows/ci.yml`, Node-Skripte; zu behalten `examples/hexnode.tools.json`, `LICENSE`, `go.mod`, `go.sum`. Zusätzlich als reines **Umgebungs-Cleanup** (untracked/gitignored, **keine** Repository-Löschung): `node_modules/`.
- **Fachliche und technische Aufgaben:** DoD-Checkliste abarbeiten, Entfernung atomar auf einem Feature-Branch, README-Verlauf anpassen.
- **Vor Abschluss zu treffende Entscheidungen:** endgültige Freigabe; Rollback-Strategie (Tag vor Entfernung).
- **Hauptrisiken und konkrete Gegenmaßnahmen:** vorschnelle Löschung → DoD-Gate und Feature-Branch; Verlust der Referenz → Tag auf den letzten TS-Stand.
- **Objektiv prüfbare Akzeptanzkriterien:** DoD vollständig erfüllt; TS-Artefakte entfernt; `go build ./...` und `go test ./...` auf dem Branch grün. **Abnehmbarer Zwischenstand:** finaler Release-Branch.
- **Ergebnisartefakte:** DoD-Nachweis, Entsorgungsliste, Release-Tag.

---

## 10. Test- und Qualitätsdesign

Dieser Abschnitt beschreibt ausschließlich das Design; er enthält keine implementierten Tests. Grundsatz: keine Testausführung gegen echte Live-APIs.

### 10.1 Testarten und Testpyramide

| Ebene | Umfang | Werkzeug | Laufzeit/Netz |
|---|---|---|---|
| Unit | Konfiguration, Priorität, Bool-Parsing, `qs`, URL-Join, Fehlerklassifizierung, Retry-Entscheidungen, Tool-Schemas | `go test`, injizierte Clock/Sleep | Millisekunden, kein Netz |
| Integration | HTTP-Client gegen kontrollierten Testserver; MCP über In-Memory-Transport | `go test`, `net/http/httptest`, SDK-In-Memory | Sekunden, kein externes Netz |
| Sicherheit/Negativ | Redaktion, Secret-Freiheit, Timeouts, Abbruch, Fehlerszenarien | `go test` | Millisekunden–Sekunden |
| Regression | übernommenes Kernverhalten aus dem TS-Bestand | `go test` | Millisekunden |

### 10.2 Test-Doubles und Fixtures

- Ein minimales, beim Konsumenten definiertes `Doer`-Interface (erfüllt von `*http.Client`) für Fakes.
- Injizierte Clock- und Sleep-Funktion für deterministische Retry-Tests (keine echten Wartezeiten).
- Lokaler `httptest`-Server für Statuscodes, `Retry-After`, Redirects und Limits.
- In-Memory-Transportpaar des SDK für MCP-Protokolltests.
- Fester Sentinel-Token in Fixtures; es werden niemals echte Secrets verwendet.

### 10.3 Testfälle je Package

| Package | Testfokus |
|---|---|
| `internal/config` | Feldweise Priorität (Flags > Env > JSON > Defaults); striktes Bool-Parsing; `0600`-Verweigerung; unbekannte JSON-Felder = Fehler |
| `internal/httpx` | Query-Serialisierung, URL-Join, Header-Reihenfolge, alle fünf Auth-Modi, Body/`Content-Type`-Regel, Redirect-Policy inkl. Credential-Stripping, Größenlimit, JSON-/Text-Normalisierung, Fehlerklassifizierung, Retry-Entscheidungen, Timeout, Cancellation, URL-Sanitisierung |
| `internal/tools` | Tool-Schemas, Pflicht-Pfadparameter, Guarded-Gate, `api_probe` mit genau einem Request, `content`/`structuredContent`, `isError` mit `error_class` |
| `internal/mcp` | Registrierung vor `connect()`, `tools/list`, Tool-Aufruf, strukturierte Ausgabe, stdout-Reinheit |
| `internal/logging` | Feldumfang, Level, Redaktion (Query-Keys, Token-Substring, Auth-Header-Werte), keine Bodies ohne Opt-in |
| `internal/devtools` | adaptives Pacing, Erzeugung/Validierung von `tools.json`, OAuth2 ohne `.env`-Schreibzugriff |
| `internal/cli` | Help-Ausgabe, ungültige Flags, fehlende Pflichtkonfiguration, Exit-Codes (`0` Erfolg, `1` generischer Laufzeitfehler, `2` Usage, `3` Konfiguration, `4` Auth zur Laufzeit, `130` SIGINT/SIGTERM) |
| `cmd/api2mcp` | Signal-Handling, geordnetes Prozessende |

### 10.4 Negative Tests

Ungültige URLs, ungültige API-Antworten, Timeout, Context-Abbruch, 4xx- und 5xx-Antworten, nicht-retrybare Fehler, zu große Antworten, unbekanntes Tool und Schemaverletzung (Protokollfehler).

### 10.5 MCP-Transport- und Protokolltests

Passend zu **stdio**: Handshake, `tools/list`, Tool-Aufruf, `isError`-Fall und strukturierte Ausgabe über das In-Memory-Transportpaar. Zusätzlich der Nachweis, dass stdout ausschließlich das Protokoll trägt und Logs auf stderr landen.

### 10.6 Regressionstests aus dem TypeScript-Bestand

Aus dem bisherigen Smoke-Test werden Handshake und die Registrierung der fünf Core-Tools übernommen. Ergänzt werden genau die Fälle, die der Smoke-Test nicht abdeckte (Abschnitt 3.4): Auth, Retry, Fehlerbehandlung, dynamische Tools, echte HTTP-Calls über `httptest`, `qs` und Logger-Redaktion.

### 10.7 Qualitäts-Gates

- Formatierung: `gofmt` ohne Abweichung.
- `go vet` ohne Befund.
- Begründete statische Analyse, z. B. `staticcheck` (Begründung: zusätzliche, praxiserprobte Fehlerklassen jenseits von `vet`).
- Relevante Race-Detection: `go test -race`.
- Coverage-Gate: `go test -cover` mit **≥ 80 % Statement-Coverage** für `internal/config`, `internal/httpx`, `internal/tools` und `internal/logging`; für `cmd/` und `internal/mcp` gilt **kein Zahlen-Gate**, da ihr Verhalten durch Integrations- und Protokolltests abgedeckt wird.
- Stabile Dokumentation von CLI und Exit-Codes.
- Keine Live-API-Abhängigkeit bei der Testausführung.
- Keine sensitiven Werte in Repository, Logs oder Fehlerausgaben.

### 10.8 CI/CD

CI/CD ist ausdrücklich **nicht** im Scope; es wird kein Pipeline-Design erstellt. Festgehalten wird nur: Der bestehende Node-Workflow (`.github/workflows/ci.yml`) entfällt in Phase 10 zusammen mit dem TypeScript-Bestand.

---

## 11. Risikoregister mit Priorität, Wahrscheinlichkeit, Auswirkung, Frühindikator und Gegenmaßnahme

| ID | Priorität (hoch/mittel/niedrig) | Wahrscheinlichkeit | Auswirkung | Frühindikator | Gegenmaßnahme | Bezug |
|---|---|---|---|---|---|---|
| R1 | hoch — blockiert die Kernentscheidungen aus 5.4/5.7 | mittel | hoch | Spike zeigt abweichende Signaturen, fehlende `isError`-/`structuredContent`-Unterstützung oder reproduzierbares #499 | Doku-Abgleich und Spike **vor** Migrationsphase 9.4; bei Fehlschlag Fallback `mark3labs/mcp-go` prüfen | 5.4/6.4, Phase 9.4 |
| R2 | mittel — betrifft nur ältere Clients, keine eigene Funktion | mittel | mittel | Client-Handshake schlägt fehl oder handelt eine ältere Revision aus | Client-Matrix dokumentieren, Handshake-Tests über In-Memory, Revisit bei Bedarf | 5.4/6.1, Phase 9.4 |
| R3 | mittel — verteuert die Phasen 2–9, gefährdet aber nicht die Lieferung | mittel | mittel | Doppelte Bugfixes oder divergierende Auth-/Retry-Semantik zwischen TS und Go | TS-Bestand bleibt read-only; Änderungen nur in Phase 10; Abschnitt 8 als Referenz | Abschnitt 8, Phase 9.10 |
| R4 | hoch — ein Leak verletzt das zentrale Sicherheitsziel | mittel | hoch | Sentinel-Test schlägt fehl; Token in Log, Fehlertext oder Tool-Ergebnis sichtbar | Zentrale Sanitisierung und Redaktion, Sentinel-Tests, credentialtragende URL nie loggen/zurückgeben | S1, S2, S4; 5.9–5.11 |
| R5 | mittel — bewusst akzeptiert, aber dauerhaft sichtbar | mittel | mittel bis hoch | Query-Token erscheint in Proxy-/Access-Logs oder `Referer` | Bewusste Risikoübernahme, Startwarnung bei `AUTH_MODE=query`, Redaktion, Migrationsnotiz | S2, 5.9 |
| R6 | hoch — betrifft bestehende Aufrufer unmittelbar | hoch | mittel bis hoch | Häufung fehlgeschlagener Aufrufe nach dem Wechsel | Migrationsnotiz (Phase 9.9), Vertragstests, Mapping aus 8.1 und Bruchliste aus 8.3 | 8.3; T9, F1, F2 |
| R7 | mittel — trifft nur bislang still akzeptierte Konfigurationen | mittel | mittel | Startfehler bei einer zuvor lauffähigen `tools.json` | Klare Validierungsfehlermeldungen, Migrationsnotiz, Beispiel-Validierung gegen das strikte Schema | F3, F4, T3, T4 |
| R8 | mittel — neues Verhalten ohne TS-Parität | niedrig bis mittel | mittel | Gehäufte `response_too_large`-Fehler bei legitimen Antworten | Limit konfigurierbar halten, Fehlerklasse dokumentieren, Migrationsnotiz | 5.9 (Neuheit) |
| R9 | hoch — Fehlentsorgung wäre schwer rückgängig zu machen | niedrig | hoch | DoD-Checkliste unvollständig oder Build/Test auf dem Branch nicht grün | DoD-Gate, Feature-Branch, Tag auf den letzten TS-Stand, Rückbau ausschließlich Phase 10 | Phase 9.10, Abschnitt 13 |
| R10 | niedrig — kein Funktionsverlust, nur Prozessrisiko | hoch | niedrig — Prozess-Hygiene, **kein Migrationsrisiko** | `git status` zeigt alle 23 getrackten Dateien als „modified“ | `core.autocrlf`/`.gitattributes` bewusst setzen; `git diff --ignore-cr-at-eol` prüfen; keine Sammel-Commits | Abschnitt 2.5 |
| R11 | mittel — Voraussetzung für den gesamten Build | niedrig | mittel | `go version` im Zielumfeld liegt unter 1.25 | Toolchain vor Phase 9.2 verifizieren; `go`-Direktive im Modul festschreiben | 5.1/5.4, Phase 9.2 |
| R12 | mittel — bewusste Scope-Entscheidung, aber Nachwirkung | hoch | niedrig | Nach Phase 10 läuft kein automatisierter Build/Test mehr | Gates manuell betreiben; CI-Design als Revisit-Punkt führen (nicht im Scope) | 10.8, Phase 9.10 |
| R13 | mittel — Qualitätsziel, kein Lieferhindernis | mittel | niedrig | `go test -cover` bleibt unter 80 % in einem der vier Packages | Coverage früh messen, Tests in Phase 9.8; Gate nicht aufweichen, sondern fehlende Fälle ergänzen | 10.7, Phase 9.8 |
| R14 | mittel — gefährdet Scope und Sicherheitsfläche | mittel | mittel | Neue Anforderungen nach Remote- oder Mehrbenutzerbetrieb | Ausschluss aus 5.6 bleibt verbindlich; Revisit-Trigger dokumentieren | 5.6 |
| R15 | mittel — betrifft nur Devzeit-Helfer | mittel | mittel | Tests verlangen echte Provider-Endpunkte | `httptest`-Fakes für OAuth2/Discovery im `devtools`-Package; Live-APIs bleiben verboten | 5.2/10.2, Phase 9.8 |
| R16 | hoch — betrifft alle bestehenden Client-Konfigurationen | hoch | mittel bis hoch | Supportfragen oder Startfehler nach dem Umstieg | Migrationsnotiz (Phase 9.9), Env-Mapping aus 8.1, Bruchliste aus 8.3 | 8.3, Phase 9.9 |

**Top-3-Steuerung:** Die höchste Steuerungswirkung haben die SDK-Verifikationspunkte (**R1**), der Secret-Leak (**R4**) und die Verhaltensbrüche (**R6**), weil sie jeweils eine tragende Entscheidung aus Abschnitt 5 bedingen. Sie werden vor der jeweiligen Phase durch Spikes, Sentinel-Tests und eine vollständige Migrationsnotiz abgesichert. Die Entsorgung des TS-Bestands (**R9**) ist trotz geringer Wahrscheinlichkeit hoch priorisiert, weil ein Fehler dort nur über den referenzierten TS-Tag rückholbar wäre.

---

## 12. Annahmen und ausschließlich echte verbleibende Blocker

### 12.1 Annahmen

Jede Zeile ist eine **Annahme**, kein verifiziertes Faktum; sie ist mit der Art ihrer Verifikation gekennzeichnet.

| Annahme | Warum nötig | Wie verifiziert |
|---|---|---|
| Die SDK-API-Oberfläche ist noch nicht gegen die Doku verifiziert (**Verifikationspunkt**, kein Faktum). | Trägt die Empfehlung in 5.4 und die Handler-Architektur in 9.4. | Doku-Abgleich und Spike vor Phase 9.4 (siehe 6.4). |
| #499 und #1262 haben keine Auswirkung auf die stdio-only-Nutzung. | Trägt die Transportentscheidung in 5.5/5.6. | Issue-Analyse und Spike vor Phase 9.4. |
| Der Modulpfad `github.com/sstreichan/api2mcp` ist aus der Remote-URL abgeleitet. | Trägt Modul- und Produktidentität (5.1). | Abgleich mit der Remote-URL aus Evidenz C. |
| Die MIT-Lizenz bleibt bestehen. | Trägt die Weitergabe und die Übernahme in Phase 9.10. | Abgleich mit `LICENSE` und den Repo-Metadaten (Evidenz C). |
| `examples/hexnode.tools.json` ist der einzige Beispiel-Contract. | Trägt die Formatstabilität in 5.8. | Dateiliste des Repositories (Abschnitt 2.2). |
| Es gibt keine weiteren Konsumenten der TS-Schnittstelle außer MCP-Clients. | Trägt die Bruchstrategie in Abschnitt 8. | 0 Issues, 0 PRs, 1 Contributor, Fork (Evidenz C). |
| Go 1.25 ist im Zielumfeld verfügbar. | Trägt Build und Modulinitialisierung (9.2). | Toolchain-Check vor Phase 9.2. |
| Die Ziel-APIs sind HTTP/JSON-nah, OAuth2-Endpunkte extern erreichbar. | Trägt HTTP-Client und `devtools` (5.9, 9.6, 9.8). | Discovery-/OAuth2-Läufe in Phase 9.6/9.8. |

### 12.2 Verbleibende Blocker

Nach dem Audit bestehen **keine echten Blocker**. Begründung: Der Prüfstand ist reproduzierbar (Commit `2ea466aa…`, HEAD == `origin/main`), die SDK-Evidenz ist vollständig genug für die Entscheidung, es gibt keine offenen Issues oder PRs, und keine Abhängigkeit ist extern unerfüllbar. Die SDK-Verifikationspunkte sind **Vorbedingungen**, keine Blocker — sie müssen vor der jeweiligen Phase eingelöst sein:

| Vorbedingung | Eingelöst in |
|---|---|
| Exakte SDK-Registrierungs- und Handler-Signaturen bestätigt | Phase 9.4 |
| `isError`- und `structuredContent`-Unterstützung bestätigt | Phase 9.4 |
| #499 und #1262 für stdio-only eingeordnet | Phase 9.4 |
| Go-1.25-Toolchain verifiziert | Phase 9.2 |
| Erreichbarkeit der Ziel-API und der OAuth2-Endpunkte geprüft | Phase 9.6/9.8 |
| Migrationsnotiz erstellt und kommuniziert | Phase 9.9 |

---

## 13. Definition of Done

Die Definition of Done ist als objektiv prüfbare Checkliste gegliedert. Jede Position ist erst dann erfüllt, wenn sie belegbar vorliegt.

### 13.1 Produkt

- [ ] `go build ./...` erfolgreich.
- [ ] `go vet ./...` ohne Befund.
- [ ] `gofmt -l` liefert eine leere Ausgabe.
- [ ] Begründete statische Analyse (z. B. `staticcheck`) sauber.
- [ ] `go test -race ./...` grün.

### 13.2 Vertrag

- [ ] MCP-Vertragstests grün: In-Memory-Transport, `tools/list` mit den 5 Kern-Tools und den dynamischen Tools, `isError`-Fall und strukturierte Ausgabe.
- [ ] stdout trägt ausschließlich das Protokoll; Logs gehen auf stderr.
- [ ] CLI: `--help` dokumentiert alle Subcommands; Exit-Codes `0`/`1`/`2`/`3`/`4`/`130` implementiert und getestet.
- [ ] `tools.json` (Format und strikte Validierung) erfüllt die Matrix aus Abschnitt 8.
- [ ] Ungültige Konfiguration bricht mit Exit 3 ab.

### 13.3 Sicherheit

- [ ] Sentinel-Token-Test beweist, dass Secrets nie in Logs, Fehlern oder Ergebnissen erscheinen.
- [ ] Die credentialtragende URL wird nie zurückgegeben.
- [ ] Die `0600`-Regel für Datei-Secrets greift und ist getestet.

### 13.4 Qualität

- [ ] Keine Live-API-Abhängigkeit für die Testausführung.
- [ ] Keine sensitiven Werte im Repository.
- [ ] Coverage-Gate aus 10.7 erfüllt (≥ 80 % Statement-Coverage für `config`, `httpx`, `tools`, `logging`).

### 13.5 Dokumentation

- [ ] `README.md` vollständig (Subcommands, Env-Mapping, Exit-Codes).
- [ ] CLI-Referenz vorhanden.
- [ ] Breaking-Change-Migrationsnotiz vorhanden und deckt Abschnitt 8.3 ab.

### 13.6 Rückbau

- [ ] TS-Artefakte erst nach erfüllter Definition of Done entfernt (ausschließlich Phase 10).
- [ ] Letzter TS-Stand ist über einen Tag referenzierbar.
- [ ] `.gitignore` enthält keine Node-/TypeScript-Einträge mehr, enthält die Go-Build-Artefakte (`/bin/`, Coverage-Ausgaben) und ignoriert `.slim/deepwork/` (Nachweis: `git check-ignore -v .slim/deepwork/` liefert einen Treffer); die OpenCode-Lesbarkeit bleibt über `.ignore` (`!.slim/deepwork/`, `!.slim/deepwork/**`) erhalten.
- [ ] `.slim/deepwork/` bleibt lokal und ignoriert.

### 13.7 Plan-Vollständigkeit

- [ ] Alle 13 Abschnitte gefüllt; keine TODOs.
- [ ] Keine Code-Fences außer dem Layoutbaum in Abschnitt 7.
- [ ] Der Plan ist direkt in Milestones, Epics und Issues zerlegbar (Abschnitt 9, Zerlegungstabelle).

### 13.8 Bewusst nicht migriert

- `.env.local`-Auto-Loading — ersetzt durch die deterministische Konfigurationspriorität aus 5.3.
- `writeEnv`-Token-Ablage — Secrets kommen nur aus Env oder Konfigurationsdatei (5.10), es wird nicht geschrieben.
- `dist/`-Build — der Go-Build ersetzt `tsc`.
- Entfallende `PROBE_*`- und Script-Env-Variablen — ersetzt durch Flags und Subcommands (8.1).
- Node-/npm-Toolchain und Lockfile — ersetzt durch das Go-Modul.
- Design einer CI/CD-Pipeline — nicht im Scope (10.8).
- SSE- und Streamable-HTTP-Transports — bewusst ausgeschlossen (5.6).
- In-Process-Betriebsmodus — bleibt Testmittel, kein Produktionsweg (5.6).
- Plan-Nicht-Scope von v0.1.0 — Docker, Kubernetes/IaC, CI/CD-Pipelines, Release-/Cross-Build, Deployment, Frontend sowie eine TypeScript-Kompatibilitätsschicht bzw. der Parallelbetrieb beider Implementierungen; Begründung: der Plan definiert die CLI-/Server-Migration, nicht Betrieb und Verteilung (Zielbild in 5.1/5.2, Transport-Ausschluss in 5.6).
