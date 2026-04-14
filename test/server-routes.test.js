"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const path = require("path");

const { shouldBypassCCBubble, shouldBypassOpencodeBubble } = require("../src/server").__test;
const { CLAWD_SERVER_HEADER, CLAWD_SERVER_ID } = require("../hooks/server-config");

// ── Shared helpers ──────────────────────────────────────────────────────────────

const STATE_SVGS = {
  working: ["clawd-working-typing.svg"],
  thinking: ["clawd-working-thinking.svg"],
  idle: ["clawd-idle-follow.svg"],
  attention: ["clawd-happy.svg"],
  error: ["clawd-error.svg"],
  notification: ["clawd-notification.svg"],
  "mini-idle": ["clawd-mini-idle.svg"],
  "mini-peek": ["clawd-mini-peek.svg"],
};

function makeCtx(overrides = {}) {
  return {
    isAgentPermissionsEnabled: () => true,
    isAgentEnabled: () => true,
    STATE_SVGS,
    PASSTHROUGH_TOOLS: new Set(["Read"]),
    updateSession: () => {},
    setState: () => {},
    doNotDisturb: false,
    pendingPermissions: [],
    permLog: () => {},
    sendPermissionResponse: () => {},
    createPermissionBubble: () => {},
    showPermissionBubble: () => {},
    createOpencodePermissionEntry: () => {},
    resolvePermissionEntry: () => {},
    destroyPermissionConnection: () => {},
    sendToRenderer: () => {},
    hideBubbles: false,
    sessions: new Map(),
    rebuildAllMenus: () => {},
    updateLog: () => {},
    focusTerminalWindow: () => {},
    replyOpencodePermission: () => {},
    ...overrides,
  };
}

// ── Inline HTTP server for route testing ────────────────────────────────────────
//
// Rather than exercising the full initServer() factory (which writes runtime
// config, syncs hooks, and watches settings.json), we create a lightweight
// HTTP server that runs the same route handler code extracted from server.js.
// This avoids side effects and lets us bind to port 0 (OS-assigned random).

const PREVIEW_MAX = 500;
function truncateDeep(obj, depth) {
  if ((depth || 0) > 10) return obj;
  if (Array.isArray(obj)) return obj.map((v) => truncateDeep(v, (depth || 0) + 1));
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = truncateDeep(v, (depth || 0) + 1);
    return out;
  }
  return typeof obj === "string" && obj.length > PREVIEW_MAX
    ? obj.slice(0, PREVIEW_MAX) + "\u2026"
    : obj;
}

function createTestServer(ctx, port) {
  let serverPort = null;
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/state") {
      const body = JSON.stringify({ ok: true, app: CLAWD_SERVER_ID, port: serverPort });
      res.writeHead(200, {
        "Content-Type": "application/json",
        [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID,
      });
      res.end(body);
    } else if (req.method === "POST" && req.url === "/state") {
      let body = "";
      let bodySize = 0;
      let tooLarge = false;
      req.on("data", (chunk) => {
        if (tooLarge) return;
        bodySize += chunk.length;
        if (bodySize > 1024) { tooLarge = true; return; }
        body += chunk;
      });
      req.on("end", () => {
        if (tooLarge) {
          res.writeHead(413);
          res.end("state payload too large");
          return;
        }
        try {
          const data = JSON.parse(body);
          const { state, svg, session_id, event } = data;
          const source_pid = Number.isFinite(data.source_pid) && data.source_pid > 0 ? Math.floor(data.source_pid) : null;
          const cwd = typeof data.cwd === "string" ? data.cwd : "";
          const editor = (data.editor === "code" || data.editor === "cursor") ? data.editor : null;
          const pidChain = Array.isArray(data.pid_chain) ? data.pid_chain.filter(n => Number.isFinite(n) && n > 0) : null;
          const rawAgentPid = data.agent_pid ?? data.claude_pid ?? data.cursor_pid;
          const agentPid = Number.isFinite(rawAgentPid) && rawAgentPid > 0 ? Math.floor(rawAgentPid) : null;
          const agentId = typeof data.agent_id === "string" ? data.agent_id : "claude-code";
          const host = typeof data.host === "string" ? data.host : null;
          const headless = data.headless === true;
          if (typeof ctx.isAgentEnabled === "function" && !ctx.isAgentEnabled(agentId)) {
            res.writeHead(204, { [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID });
            res.end();
            return;
          }
          if (ctx.STATE_SVGS[state]) {
            const sid = session_id || "default";
            if (state.startsWith("mini-") && !svg) {
              res.writeHead(400);
              res.end("mini states require svg override");
              return;
            }
            if (svg) {
              const safeSvg = path.basename(svg);
              ctx.setState(state, safeSvg);
            } else {
              ctx.updateSession(sid, state, event, source_pid, cwd, editor, pidChain, agentPid, agentId, host, headless);
            }
            res.writeHead(200, { [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID });
            res.end("ok");
          } else {
            res.writeHead(400);
            res.end("unknown state");
          }
        } catch {
          res.writeHead(400);
          res.end("bad json");
        }
      });
    } else if (req.method === "POST" && req.url === "/permission") {
      ctx.permLog(`/permission hit | DND=${ctx.doNotDisturb} pending=${ctx.pendingPermissions.length}`);
      let body = "";
      let bodySize = 0;
      let tooLarge = false;
      req.on("data", (chunk) => {
        if (tooLarge) return;
        bodySize += chunk.length;
        if (bodySize > 524288) { tooLarge = true; return; }
        body += chunk;
      });
      req.on("end", () => {
        if (tooLarge) {
          ctx.permLog("SKIPPED: permission payload too large");
          ctx.sendPermissionResponse(res, "deny", "Permission request too large for Clawd bubble; answer in terminal");
          return;
        }
        let data;
        try {
          data = JSON.parse(body);
        } catch {
          res.writeHead(400);
          res.end("bad json");
          return;
        }
        try {
          // opencode branch
          if (data.agent_id === "opencode") {
            res.writeHead(200, { [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID });
            res.end("ok");
            if (typeof ctx.isAgentEnabled === "function" && !ctx.isAgentEnabled("opencode")) {
              return;
            }
            if (ctx.doNotDisturb) return;
            return;
          }
          // Claude Code branch: DND
          if (ctx.doNotDisturb) {
            res.destroy();
            return;
          }
          // Agent gate
          const ccAgentId = typeof data.agent_id === "string" && data.agent_id ? data.agent_id : "claude-code";
          if (typeof ctx.isAgentEnabled === "function" && !ctx.isAgentEnabled(ccAgentId)) {
            res.destroy();
            return;
          }
          const toolName = typeof data.tool_name === "string" ? data.tool_name : "Unknown";
          const sessionId = data.session_id || "default";
          const permAgentId = typeof data.agent_id === "string" && data.agent_id ? data.agent_id : "claude-code";

          const existingSession = ctx.sessions.get(sessionId);
          if (existingSession && existingSession.headless) {
            ctx.sendPermissionResponse(res, "deny", "Non-interactive session; auto-denied");
            return;
          }
          if (ctx.PASSTHROUGH_TOOLS.has(toolName)) {
            ctx.sendPermissionResponse(res, "allow");
            return;
          }
          if (shouldBypassCCBubble(ctx, toolName, permAgentId)) {
            res.destroy();
            return;
          }
          // Default: push to pending. In production the response stays open
          // until the user decides via the bubble. In tests, end immediately.
          ctx.pendingPermissions.push({ toolName, sessionId, agentId: permAgentId });
          if (!res.headersSent) {
            res.writeHead(200, { [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID });
          }
          res.end("ok");
        } catch {
          if (!res.headersSent) {
            res.writeHead(500);
            res.end("internal error");
          }
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port || 0, "127.0.0.1", () => {
      serverPort = server.address().port;
      resolve({ server, port: serverPort });
    });
    server.on("error", reject);
  });
}

/** Promisified HTTP request helper with timeout. */
function request(port, options, body, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`request timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    const req = http.request(
      { hostname: "127.0.0.1", port, ...options },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve({ res, body: data });
          }
        });
        res.on("close", () => {
          // Socket was destroyed before response completed
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve({ res, body: data, destroyed: true });
          }
        });
      },
    );
    req.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
    if (body !== undefined) req.write(body);
    req.end();
  });
}

// ── 1. Pure functions via __test export ─────────────────────────────────────────

describe("shouldBypassCCBubble", () => {
  it("returns false for ExitPlanMode regardless of agent perms", () => {
    const ctx = { isAgentPermissionsEnabled: () => false };
    assert.strictEqual(shouldBypassCCBubble(ctx, "ExitPlanMode", "claude-code"), false);
  });

  it("returns false for AskUserQuestion regardless of agent perms", () => {
    const ctx = { isAgentPermissionsEnabled: () => false };
    assert.strictEqual(shouldBypassCCBubble(ctx, "AskUserQuestion", "claude-code"), false);
  });

  it("returns false when isAgentPermissionsEnabled is not a function", () => {
    assert.strictEqual(shouldBypassCCBubble({}, "Bash", "claude-code"), false);
    assert.strictEqual(shouldBypassCCBubble({ isAgentPermissionsEnabled: null }, "Bash", "agent"), false);
  });

  it("returns true when isAgentPermissionsEnabled(agentId) returns false", () => {
    const ctx = { isAgentPermissionsEnabled: () => false };
    assert.strictEqual(shouldBypassCCBubble(ctx, "Bash", "claude-code"), true);
    assert.strictEqual(shouldBypassCCBubble(ctx, "Write", "codebuddy"), true);
  });

  it("returns false when isAgentPermissionsEnabled(agentId) returns true", () => {
    const ctx = { isAgentPermissionsEnabled: () => true };
    assert.strictEqual(shouldBypassCCBubble(ctx, "Bash", "claude-code"), false);
  });
});

describe("shouldBypassOpencodeBubble", () => {
  it("returns false when isAgentPermissionsEnabled is not a function", () => {
    assert.strictEqual(shouldBypassOpencodeBubble({}), false);
    assert.strictEqual(shouldBypassOpencodeBubble({ isAgentPermissionsEnabled: null }), false);
  });

  it("returns true when isAgentPermissionsEnabled(opencode) returns false", () => {
    const ctx = { isAgentPermissionsEnabled: () => false };
    assert.strictEqual(shouldBypassOpencodeBubble(ctx), true);
  });

  it("returns false when isAgentPermissionsEnabled(opencode) returns true", () => {
    const ctx = { isAgentPermissionsEnabled: () => true };
    assert.strictEqual(shouldBypassOpencodeBubble(ctx), false);
  });

  it("always queries the 'opencode' agent id", () => {
    const calls = [];
    const ctx = {
      isAgentPermissionsEnabled(id) { calls.push(id); return true; },
    };
    shouldBypassOpencodeBubble(ctx);
    assert.deepStrictEqual(calls, ["opencode"]);
  });
});

// ── 2. truncateDeep (standalone replica) ────────────────────────────────────────

describe("truncateDeep", () => {
  it("passes short strings through unchanged", () => {
    assert.strictEqual(truncateDeep("hello"), "hello");
  });

  it("truncates strings longer than 500 chars and appends ellipsis", () => {
    const longStr = "a".repeat(501);
    const result = truncateDeep(longStr);
    assert.strictEqual(result.length, 501);
    assert.ok(result.endsWith("\u2026"));
    assert.strictEqual(result.slice(0, -1), "a".repeat(500));
  });

  it("does not truncate strings exactly 500 chars", () => {
    const str500 = "b".repeat(500);
    assert.strictEqual(truncateDeep(str500), str500);
  });

  it("recursively processes arrays", () => {
    const longStr = "x".repeat(501);
    const input = ["short", longStr, "also short"];
    const result = truncateDeep(input);
    assert.strictEqual(result[0], "short");
    assert.ok(result[1].endsWith("\u2026"));
    assert.strictEqual(result[2], "also short");
  });

  it("recursively processes nested objects", () => {
    const longStr = "z".repeat(600);
    const input = { outer: { inner: longStr, kept: "ok" } };
    const result = truncateDeep(input);
    assert.strictEqual(result.outer.kept, "ok");
    assert.ok(result.outer.inner.endsWith("\u2026"));
    assert.strictEqual(result.outer.inner.length, 501);
  });

  it("returns objects as-is when depth exceeds 10", () => {
    let obj = "leaf";
    for (let i = 0; i < 12; i++) obj = { val: obj };
    const result = truncateDeep(obj);
    let current = result;
    for (let i = 0; i < 10; i++) current = current.val;
    // depth 10 still recurses; depth 11 returns the object as-is
    assert.strictEqual(typeof current.val, "object");
  });

  it("passes numbers through unchanged", () => {
    assert.strictEqual(truncateDeep(42), 42);
    assert.strictEqual(truncateDeep(0), 0);
    assert.strictEqual(truncateDeep(-3.14), -3.14);
  });

  it("passes booleans through unchanged", () => {
    assert.strictEqual(truncateDeep(true), true);
    assert.strictEqual(truncateDeep(false), false);
  });

  it("passes null and undefined through unchanged", () => {
    assert.strictEqual(truncateDeep(null), null);
    assert.strictEqual(truncateDeep(undefined), undefined);
  });
});

// ── 3. HTTP server integration tests ────────────────────────────────────────────

describe("HTTP server routes", () => {
  let server = null;
  let port = null;

  beforeEach(async () => {
    const result = await createTestServer(makeCtx());
    server = result.server;
    port = result.port;
  });

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
  });

  /** Re-create the server with a different ctx. */
  async function restartWith(overrides) {
    server.close();
    const result = await createTestServer(makeCtx(overrides));
    server = result.server;
    port = result.port;
  }

  describe("GET /state", () => {
    it("returns 200 with ok, app name, and port", async () => {
      const { res, body } = await request(port, { method: "GET", path: "/state" });
      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(body);
      assert.strictEqual(data.ok, true);
      assert.strictEqual(data.app, "clawd-on-desk");
      assert.strictEqual(data.port, port);
    });

    it("returns x-clawd-server header", async () => {
      const { res } = await request(port, { method: "GET", path: "/state" });
      assert.strictEqual(res.headers["x-clawd-server"], "clawd-on-desk");
    });
  });

  describe("POST /state", () => {
    it("returns 200 for a valid state update", async () => {
      const payload = JSON.stringify({ state: "working" });
      const { res, body } = await request(
        port,
        { method: "POST", path: "/state", headers: { "Content-Type": "application/json" } },
        payload,
      );
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(body, "ok");
    });

    it("returns 400 for invalid JSON body", async () => {
      const { res, body } = await request(
        port,
        { method: "POST", path: "/state", headers: { "Content-Type": "application/json" } },
        "{bad json}",
      );
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(body, "bad json");
    });

    it("returns 400 for unknown state", async () => {
      const payload = JSON.stringify({ state: "nonexistent_state" });
      const { res, body } = await request(
        port,
        { method: "POST", path: "/state", headers: { "Content-Type": "application/json" } },
        payload,
      );
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(body, "unknown state");
    });

    it("returns 413 for body exceeding 1024 bytes", async () => {
      const bigPayload = JSON.stringify({ state: "working", padding: "x".repeat(1100) });
      const { res, body } = await request(
        port,
        { method: "POST", path: "/state", headers: { "Content-Type": "application/json" } },
        bigPayload,
      );
      assert.strictEqual(res.statusCode, 413);
      assert.strictEqual(body, "state payload too large");
    });

    it("returns 204 when agent is disabled (agent gate)", async () => {
      await restartWith({ isAgentEnabled: () => false });

      const payload = JSON.stringify({ state: "working" });
      const { res } = await request(
        port,
        { method: "POST", path: "/state", headers: { "Content-Type": "application/json" } },
        payload,
      );
      assert.strictEqual(res.statusCode, 204);
    });

    it("calls ctx.updateSession with parsed fields", async () => {
      const calls = [];
      await restartWith({
        updateSession(...args) { calls.push(args); },
      });

      const payload = JSON.stringify({
        state: "working",
        session_id: "sess-42",
        event: "PreToolUse",
        source_pid: 1234,
        cwd: "/home/user/project",
      });
      await request(
        port,
        { method: "POST", path: "/state", headers: { "Content-Type": "application/json" } },
        payload,
      );

      assert.strictEqual(calls.length, 1);
      const args = calls[0];
      assert.strictEqual(args[0], "sess-42");   // session_id
      assert.strictEqual(args[1], "working");    // state
      assert.strictEqual(args[2], "PreToolUse"); // event
      assert.strictEqual(args[3], 1234);         // source_pid
      assert.strictEqual(args[4], "/home/user/project"); // cwd
    });

    it("handles svg override by calling ctx.setState", async () => {
      const setStateCalls = [];
      await restartWith({
        setState(state, svg) { setStateCalls.push({ state, svg }); },
      });

      const payload = JSON.stringify({
        state: "working",
        svg: "clawd-working-building.svg",
      });
      await request(
        port,
        { method: "POST", path: "/state", headers: { "Content-Type": "application/json" } },
        payload,
      );

      assert.strictEqual(setStateCalls.length, 1);
      assert.strictEqual(setStateCalls[0].state, "working");
      assert.strictEqual(setStateCalls[0].svg, "clawd-working-building.svg");
    });

    it("sanitizes svg path via path.basename", async () => {
      const setStateCalls = [];
      await restartWith({
        setState(state, svg) { setStateCalls.push({ state, svg }); },
      });

      const payload = JSON.stringify({
        state: "working",
        svg: "../../../etc/passwd",
      });
      await request(
        port,
        { method: "POST", path: "/state", headers: { "Content-Type": "application/json" } },
        payload,
      );

      assert.strictEqual(setStateCalls[0].svg, "passwd");
    });

    it("defaults agent_id to 'claude-code' when missing", async () => {
      const calls = [];
      await restartWith({
        updateSession(...args) { calls.push(args); },
      });

      const payload = JSON.stringify({ state: "idle" });
      await request(
        port,
        { method: "POST", path: "/state", headers: { "Content-Type": "application/json" } },
        payload,
      );

      assert.strictEqual(calls[0][8], "claude-code"); // agentId argument
    });

    it("rejects mini states without svg override", async () => {
      const payload = JSON.stringify({ state: "mini-idle" });
      const { res, body } = await request(
        port,
        { method: "POST", path: "/state", headers: { "Content-Type": "application/json" } },
        payload,
      );
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(body, "mini states require svg override");
    });
  });

  describe("POST /permission", () => {
    it("returns 200 ACK for opencode branch", async () => {
      const payload = JSON.stringify({
        agent_id: "opencode",
        tool_name: "Bash",
        tool_input: { command: "ls" },
        session_id: "s1",
        request_id: "req-1",
        bridge_url: "http://127.0.0.1:9999",
        bridge_token: "tok123",
      });
      const { res, body } = await request(
        port,
        { method: "POST", path: "/permission", headers: { "Content-Type": "application/json" } },
        payload,
      );
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(body, "ok");
    });

    it("returns 200 ACK for opencode even in DND mode", async () => {
      await restartWith({ doNotDisturb: true });

      const payload = JSON.stringify({
        agent_id: "opencode",
        tool_name: "Bash",
        tool_input: {},
        session_id: "s1",
        request_id: "req-1",
        bridge_url: "http://127.0.0.1:9999",
        bridge_token: "tok123",
      });
      const { res, body } = await request(
        port,
        { method: "POST", path: "/permission", headers: { "Content-Type": "application/json" } },
        payload,
      );
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(body, "ok");
    });

    it("drops silently in DND mode for Claude Code (connection destroyed)", async () => {
      await restartWith({ doNotDisturb: true });

      const payload = JSON.stringify({
        tool_name: "Bash",
        tool_input: { command: "rm -rf /" },
        session_id: "s1",
      });

      // When res.destroy() is called, the connection is torn down.
      // The client may see ECONNRESET, socket close, or a timeout.
      let gotDestroyed = false;
      try {
        const result = await request(
          port,
          { method: "POST", path: "/permission", headers: { "Content-Type": "application/json" } },
          payload,
          3000,
        );
        // Socket destroyed before response completed
        if (result.destroyed) gotDestroyed = true;
      } catch (err) {
        // Connection reset or similar is expected
        gotDestroyed = true;
      }
      assert.ok(gotDestroyed, "expected connection to be destroyed in DND mode");
    });

    it("auto-denies headless sessions", async () => {
      const permResponses = [];
      await restartWith({
        sessions: new Map([["s-headless", { headless: true }]]),
        sendPermissionResponse(res, behavior, reason) {
          permResponses.push({ behavior, reason });
          // Must actually end the HTTP response to avoid client hanging
          if (!res.headersSent) {
            res.writeHead(200, { "Content-Type": "application/json" });
          }
          res.end(JSON.stringify({ behavior }));
        },
      });

      const payload = JSON.stringify({
        tool_name: "Bash",
        tool_input: { command: "ls" },
        session_id: "s-headless",
      });
      await request(
        port,
        { method: "POST", path: "/permission", headers: { "Content-Type": "application/json" } },
        payload,
      );

      assert.strictEqual(permResponses.length, 1);
      assert.strictEqual(permResponses[0].behavior, "deny");
    });

    it("auto-allows passthrough tools", async () => {
      const permResponses = [];
      await restartWith({
        PASSTHROUGH_TOOLS: new Set(["Read", "Glob"]),
        sendPermissionResponse(res, behavior) {
          permResponses.push({ behavior });
          if (!res.headersSent) {
            res.writeHead(200, { "Content-Type": "application/json" });
          }
          res.end(JSON.stringify({ behavior }));
        },
      });

      const payload = JSON.stringify({
        tool_name: "Read",
        tool_input: { file_path: "/tmp/test.txt" },
        session_id: "s1",
      });
      await request(
        port,
        { method: "POST", path: "/permission", headers: { "Content-Type": "application/json" } },
        payload,
      );

      assert.strictEqual(permResponses.length, 1);
      assert.strictEqual(permResponses[0].behavior, "allow");
    });

    it("destroys connection when bubble sub-gate bypasses", async () => {
      await restartWith({
        isAgentPermissionsEnabled: () => false,
      });

      const payload = JSON.stringify({
        tool_name: "Bash",
        tool_input: { command: "ls" },
        session_id: "s1",
      });

      let gotDestroyed = false;
      try {
        const result = await request(
          port,
          { method: "POST", path: "/permission", headers: { "Content-Type": "application/json" } },
          payload,
          3000,
        );
        if (result.destroyed) gotDestroyed = true;
      } catch {
        gotDestroyed = true;
      }
      assert.ok(gotDestroyed, "expected connection to be destroyed when sub-gate bypasses");
    });

    it("pushes permission entry to pendingPermissions for normal flow", async () => {
      const pendingPermissions = [];
      await restartWith({ pendingPermissions });

      const payload = JSON.stringify({
        tool_name: "Bash",
        tool_input: { command: "ls -la" },
        session_id: "s-normal",
      });
      await request(
        port,
        { method: "POST", path: "/permission", headers: { "Content-Type": "application/json" } },
        payload,
      );

      assert.strictEqual(pendingPermissions.length, 1);
      assert.strictEqual(pendingPermissions[0].toolName, "Bash");
      assert.strictEqual(pendingPermissions[0].sessionId, "s-normal");
    });

    it("returns 400 for invalid JSON body", async () => {
      const { res, body } = await request(
        port,
        { method: "POST", path: "/permission", headers: { "Content-Type": "application/json" } },
        "{bad json}",
      );
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(body, "bad json");
    });
  });

  describe("404 for unknown routes", () => {
    it("returns 404 for unknown paths", async () => {
      const { res } = await request(port, { method: "GET", path: "/unknown" });
      assert.strictEqual(res.statusCode, 404);
    });

    it("returns 404 for unsupported methods on known paths", async () => {
      const { res } = await request(port, { method: "PUT", path: "/state" });
      assert.strictEqual(res.statusCode, 404);
    });
  });
});
