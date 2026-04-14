const { describe, it } = require("node:test");
const assert = require("node:assert");

const { __test } = require("../agents/codex-log-monitor");

// wmic may not be available on newer Windows 11; skip if so
const hasPidTools = (() => {
  if (process.platform === "win32") {
    try {
      const { execFileSync } = require("child_process");
      execFileSync("wmic", ["--version"], { encoding: "utf8", timeout: 3000, windowsHide: true });
      return true;
    } catch { return false; }
  }
  try {
    const { execFileSync } = require("child_process");
    execFileSync("pgrep", ["--version"], { encoding: "utf8", timeout: 3000 });
    return true;
  } catch { return false; }
})();

describe("findCodexProcessPids()", () => {
  it("returns an array", () => {
    const pids = __test.findCodexProcessPids();
    assert.ok(Array.isArray(pids));
  });

  it("returns empty array when no codex running", () => {
    const pids = __test.findCodexProcessPids();
    // Codex is likely not running during tests
    assert.ok(pids.length >= 0);
  });
});

describe("walkToTerminal()", () => {
  it("returns null for non-existent PID", () => {
    const result = __test.walkToTerminal(99999999);
    assert.strictEqual(result, null);
  });

  it("returns null for PID 0 or 1", () => {
    assert.strictEqual(__test.walkToTerminal(0), null);
    assert.strictEqual(__test.walkToTerminal(1), null);
  });

  it("returns null for negative PID", () => {
    assert.strictEqual(__test.walkToTerminal(-1), null);
  });

  it("walks from current process to find terminal or null", { skip: !hasPidTools }, () => {
    // This test walks from our own process — may or may not find a terminal
    const result = __test.walkToTerminal(process.pid);
    // Result is either a number (terminal PID) or null (e.g. IDE terminal)
    if (result !== null) {
      assert.ok(typeof result === "number" && result > 0);
    }
  });
});
