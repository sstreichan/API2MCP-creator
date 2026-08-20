import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Smoke test: actually launches the MCP server as a child process over its
// real stdio transport (the way any MCP client would) and asks it to list
// its tools. This exercises the full module — env parsing, McpServer setup,
// and every server.tool(...) registration call — rather than just importing
// it, since src/server.ts connects to a live stdio transport as a top-level
// side effect and cannot be safely `import`-ed in-process during a test run.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const tsxCli = path.resolve(repoRoot, "node_modules/tsx/dist/cli.mjs");
const serverEntry = path.resolve(repoRoot, "src/server.ts");

type JsonRpcMessage = { id?: number; method?: string; result?: any; error?: any };

function waitForMessage(
  child: ReturnType<typeof spawn>,
  predicate: (m: JsonRpcMessage) => boolean,
  timeoutMs = 10_000,
): Promise<JsonRpcMessage> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      child.stdout?.off("data", onData);
      reject(new Error("Timed out waiting for MCP response from server"));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as JsonRpcMessage;
          if (predicate(msg)) {
            clearTimeout(timer);
            child.stdout?.off("data", onData);
            resolve(msg);
            return;
          }
        } catch {
          // ignore non-JSON noise on stdout
        }
      }
    };

    child.stdout?.on("data", onData);
  });
}

test("server starts over stdio and registers the expected tools", async () => {
  const child = spawn(process.execPath, [tsxCli, serverEntry], {
    cwd: repoRoot,
    env: { ...process.env, API_BASE: "https://api.example.com/v1" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr?.on("data", (c: Buffer) => {
    stderr += c.toString("utf8");
  });

  try {
    const send = (msg: Record<string, unknown>) => {
      child.stdin?.write(JSON.stringify(msg) + "\n");
    };

    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "0.0.0" },
      },
    });
    await waitForMessage(child, (m) => m.id === 1);

    send({ jsonrpc: "2.0", method: "notifications/initialized" });

    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const toolsResponse = await waitForMessage(child, (m) => m.id === 2);

    assert.ok(
      toolsResponse.result,
      `expected a tools/list result, got: ${JSON.stringify(toolsResponse)}\nstderr: ${stderr}`,
    );

    const names = (toolsResponse.result.tools as Array<{ name: string }>).map((t) => t.name);
    for (const expected of ["api_probe", "api_get", "api_post", "api_put", "api_delete"]) {
      assert.ok(names.includes(expected), `expected tool "${expected}" to be registered, got: ${names.join(", ")}`);
    }
  } finally {
    child.kill();
  }
});
