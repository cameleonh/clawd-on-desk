// test/state-extended.test.js — Unit tests for uncovered functions from src/state.js
const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert");

const themeLoader = require("../src/theme-loader");
themeLoader.init(require("path").join(__dirname, "..", "src"));
const _defaultTheme = themeLoader.loadTheme("clawd");

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides = {}) {
  return {
    theme: _defaultTheme,
    doNotDisturb: false,
    miniTransitioning: false,
    miniMode: false,
    mouseOverPet: false,
    idlePaused: false,
    forceEyeResend: false,
    eyePauseUntil: 0,
    mouseStillSince: Date.now(),
    miniSleepPeeked: false,
    playSound: () => {},
    sendToRenderer: () => {},
    syncHitWin: () => {},
    sendToHitWin: () => {},
    miniPeekIn: () => {},
    miniPeekOut: () => {},
    buildContextMenu: () => {},
    buildTrayMenu: () => {},
    pendingPermissions: [],
    resolvePermissionEntry: () => {},
    t: (k) => k,
    showSessionId: false,
    focusTerminalWindow: () => {},
    processKill: () => { const e = new Error("ESRCH"); e.code = "ESRCH"; throw e; },
    getCursorScreenPoint: () => ({ x: 100, y: 100 }),
    ...overrides,
  };
}

function rawSession(state, opts = {}) {
  return {
    state,
    updatedAt: opts.updatedAt ?? Date.now(),
    displayHint: opts.displayHint || null,
    sourcePid: opts.sourcePid || null,
    cwd: opts.cwd || "",
    editor: opts.editor || null,
    pidChain: opts.pidChain || null,
    agentPid: opts.agentPid || null,
    agentId: opts.agentId || null,
    host: opts.host || null,
    headless: opts.headless || false,
    pidReachable: opts.pidReachable ?? false,
  };
}

const initState = require("../src/state");

// ═════════════════════════════════════════════════════════════════════════════
// clearSessionsByAgent(agentId)
// ═════════════════════════════════════════════════════════════════════════════

describe("clearSessionsByAgent()", () => {
  let api;

  beforeEach(() => { api = initState(makeCtx()); });
  afterEach(() => { api.cleanup(); });

  it("returns 0 for falsy agentId", () => {
    api.sessions.set("s1", rawSession("working", { agentId: "claude-code" }));
    assert.strictEqual(api.clearSessionsByAgent(null), 0);
    assert.strictEqual(api.clearSessionsByAgent(""), 0);
    assert.strictEqual(api.clearSessionsByAgent(undefined), 0);
    assert.strictEqual(api.sessions.size, 1);
  });

  it("removes only sessions matching the given agentId", () => {
    api.sessions.set("s1", rawSession("working", { agentId: "claude-code" }));
    api.sessions.set("s2", rawSession("thinking", { agentId: "codex" }));
    api.sessions.set("s3", rawSession("working", { agentId: "claude-code" }));
    const removed = api.clearSessionsByAgent("claude-code");
    assert.strictEqual(removed, 2);
    assert.strictEqual(api.sessions.size, 1);
    assert.ok(api.sessions.has("s2"));
  });

  it("leaves sessions from other agents intact", () => {
    api.sessions.set("s1", rawSession("working", { agentId: "codex" }));
    api.sessions.set("s2", rawSession("working", { agentId: "opencode" }));
    const removed = api.clearSessionsByAgent("claude-code");
    assert.strictEqual(removed, 0);
    assert.strictEqual(api.sessions.size, 2);
  });

  it("returns correct removal count when all match", () => {
    api.sessions.set("s1", rawSession("working", { agentId: "gemini-cli" }));
    api.sessions.set("s2", rawSession("thinking", { agentId: "gemini-cli" }));
    const removed = api.clearSessionsByAgent("gemini-cli");
    assert.strictEqual(removed, 2);
    assert.strictEqual(api.sessions.size, 0);
  });

  it("triggers resolveDisplayState after removal (displayed state changes)", () => {
    api.sessions.set("s1", rawSession("working", { agentId: "claude-code" }));
    api.sessions.set("s2", rawSession("thinking", { agentId: "codex" }));
    assert.strictEqual(api.resolveDisplayState(), "working");
    api.clearSessionsByAgent("claude-code");
    assert.strictEqual(api.resolveDisplayState(), "thinking");
    api.clearSessionsByAgent("codex");
    assert.strictEqual(api.resolveDisplayState(), "idle");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getSvgOverride() — covers getActiveWorkingCount / getWorkingSvg internally
// ═════════════════════════════════════════════════════════════════════════════

describe("getSvgOverride() — working tiers via getWorkingSvg/getActiveWorkingCount", () => {
  let api, ctx;

  beforeEach(() => {
    ctx = makeCtx();
    api = initState(ctx);
  });
  afterEach(() => { api.cleanup(); });

  it("returns default working SVG when no sessions and no theme tiers", () => {
    const svg = api.getSvgOverride("working");
    assert.strictEqual(svg, api.STATE_SVGS.working[0]);
  });

  it("returns default working SVG when theme has no workingTiers", () => {
    ctx.theme = { ..._defaultTheme, workingTiers: null };
    api.refreshTheme();
    api.sessions.set("s1", rawSession("working"));
    api.sessions.set("s2", rawSession("working"));
    assert.strictEqual(api.getSvgOverride("working"), api.STATE_SVGS.working[0]);
  });

  it("returns tier SVG based on non-headless session count", () => {
    ctx.theme = {
      ..._defaultTheme,
      workingTiers: [
        { minSessions: 3, file: "tier-building.svg" },
        { minSessions: 2, file: "tier-juggling.svg" },
        { minSessions: 1, file: "tier-typing.svg" },
      ],
    };
    api.refreshTheme();

    // 1 non-headless working session -> tier-typing
    api.sessions.set("s1", rawSession("working"));
    assert.strictEqual(api.getSvgOverride("working"), "tier-typing.svg");

    // 2 non-headless -> tier-juggling
    api.sessions.set("s2", rawSession("working"));
    assert.strictEqual(api.getSvgOverride("working"), "tier-juggling.svg");

    // 3 non-headless -> tier-building
    api.sessions.set("s3", rawSession("working"));
    assert.strictEqual(api.getSvgOverride("working"), "tier-building.svg");
  });

  it("picks first matching tier (highest minSessions <= count)", () => {
    ctx.theme = {
      ..._defaultTheme,
      workingTiers: [
        { minSessions: 5, file: "tier-mega.svg" },
        { minSessions: 2, file: "tier-mid.svg" },
        { minSessions: 1, file: "tier-low.svg" },
      ],
    };
    api.refreshTheme();

    api.sessions.set("s1", rawSession("working"));
    api.sessions.set("s2", rawSession("working"));
    api.sessions.set("s3", rawSession("working"));
    // 3 sessions: 5 not met, 2 met first in array iteration -> tier-mid
    assert.strictEqual(api.getSvgOverride("working"), "tier-mid.svg");
  });

  it("excludes headless sessions from working count for tiers", () => {
    ctx.theme = {
      ..._defaultTheme,
      workingTiers: [
        { minSessions: 2, file: "tier-two.svg" },
      ],
    };
    api.refreshTheme();

    api.sessions.set("s1", rawSession("working"));
    api.sessions.set("s2", rawSession("working", { headless: true }));
    // Only 1 non-headless, threshold 2 not met -> fallback
    assert.strictEqual(api.getSvgOverride("working"), api.STATE_SVGS.working[0]);
  });

  it("counts thinking and juggling sessions toward working count", () => {
    ctx.theme = {
      ..._defaultTheme,
      workingTiers: [
        { minSessions: 3, file: "tier-three.svg" },
      ],
    };
    api.refreshTheme();

    api.sessions.set("s1", rawSession("working"));
    api.sessions.set("s2", rawSession("thinking"));
    api.sessions.set("s3", rawSession("juggling"));
    assert.strictEqual(api.getSvgOverride("working"), "tier-three.svg");
  });

  it("excludes idle/sleeping/error sessions from working count", () => {
    ctx.theme = {
      ..._defaultTheme,
      workingTiers: [
        { minSessions: 1, file: "tier-one.svg" },
      ],
    };
    api.refreshTheme();

    api.sessions.set("s1", rawSession("idle"));
    api.sessions.set("s2", rawSession("sleeping"));
    api.sessions.set("s3", rawSession("error"));
    // No working/thinking/juggling -> no tier matched -> fallback
    assert.strictEqual(api.getSvgOverride("working"), api.STATE_SVGS.working[0]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getSvgOverride() — covers getJugglingSvg internally
// ═════════════════════════════════════════════════════════════════════════════

describe("getSvgOverride() — juggling tiers via getJugglingSvg", () => {
  let api, ctx;

  beforeEach(() => {
    ctx = makeCtx();
    api = initState(ctx);
  });
  afterEach(() => { api.cleanup(); });

  it("returns default juggling SVG when no theme tiers", () => {
    ctx.theme = { ..._defaultTheme, jugglingTiers: null };
    api.refreshTheme();
    api.sessions.set("s1", rawSession("juggling"));
    assert.strictEqual(api.getSvgOverride("juggling"), api.STATE_SVGS.juggling[0]);
  });

  it("returns tier SVG when juggling count meets threshold", () => {
    ctx.theme = {
      ..._defaultTheme,
      jugglingTiers: [
        { minSessions: 2, file: "tier-conducting.svg" },
        { minSessions: 1, file: "tier-juggling.svg" },
      ],
    };
    api.refreshTheme();

    api.sessions.set("s1", rawSession("juggling"));
    assert.strictEqual(api.getSvgOverride("juggling"), "tier-juggling.svg");

    api.sessions.set("s2", rawSession("juggling"));
    assert.strictEqual(api.getSvgOverride("juggling"), "tier-conducting.svg");
  });

  it("excludes headless sessions from juggling count", () => {
    ctx.theme = {
      ..._defaultTheme,
      jugglingTiers: [
        { minSessions: 2, file: "tier-two.svg" },
      ],
    };
    api.refreshTheme();

    api.sessions.set("s1", rawSession("juggling"));
    api.sessions.set("s2", rawSession("juggling", { headless: true }));
    // Only 1 non-headless juggling -> threshold not met
    assert.strictEqual(api.getSvgOverride("juggling"), api.STATE_SVGS.juggling[0]);
  });

  it("only counts juggling state for juggling tiers, not working/thinking", () => {
    ctx.theme = {
      ..._defaultTheme,
      jugglingTiers: [
        { minSessions: 1, file: "tier-one.svg" },
      ],
    };
    api.refreshTheme();

    api.sessions.set("s1", rawSession("working"));
    api.sessions.set("s2", rawSession("thinking"));
    // 0 juggling sessions -> fallback
    assert.strictEqual(api.getSvgOverride("juggling"), api.STATE_SVGS.juggling[0]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// setUpdateVisualState(kind)
// ═════════════════════════════════════════════════════════════════════════════

describe("setUpdateVisualState()", () => {
  let api;

  beforeEach(() => { api = initState(makeCtx()); });
  afterEach(() => { api.cleanup(); });

  it("setting null clears the overlay state (returns null)", () => {
    api.setUpdateVisualState("checking");
    const result = api.setUpdateVisualState(null);
    assert.strictEqual(result, null);
    assert.strictEqual(api.resolveDisplayState(), "idle");
  });

  it("setting undefined clears the overlay state (returns null)", () => {
    api.setUpdateVisualState("checking");
    const result = api.setUpdateVisualState(undefined);
    assert.strictEqual(result, null);
  });

  it("maps 'checking' to 'sweeping' via UPDATE_VISUAL_STATE_MAP", () => {
    const result = api.setUpdateVisualState("checking");
    assert.strictEqual(result, "sweeping");
    api.setUpdateVisualState(null);
  });

  it("maps 'downloading' to 'carrying' via UPDATE_VISUAL_STATE_MAP", () => {
    const result = api.setUpdateVisualState("downloading");
    assert.strictEqual(result, "carrying");
    api.setUpdateVisualState(null);
  });

  it("unknown kind uses kind as-is (falls through)", () => {
    const result = api.setUpdateVisualState("custom-state");
    assert.strictEqual(result, "custom-state");
    api.setUpdateVisualState(null);
  });

  it("returns correct svg override for checking state", () => {
    api.setUpdateVisualState("checking");
    assert.strictEqual(api.getSvgOverride("sweeping"), "clawd-working-debugger.svg");
    api.setUpdateVisualState(null);
  });

  it("svg override only applies when state matches update visual state", () => {
    api.setUpdateVisualState("checking");
    // sweeping matches the update state -> returns override
    assert.strictEqual(api.getSvgOverride("sweeping"), "clawd-working-debugger.svg");
    // working does not match sweeping -> goes through normal working path
    const workingSvg = api.getSvgOverride("working");
    assert.ok(workingSvg !== "clawd-working-debugger.svg");
    api.setUpdateVisualState(null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getSvgOverride() — covers getWinningSessionDisplayHint internally
// ═════════════════════════════════════════════════════════════════════════════

describe("getSvgOverride() — display hint resolution via getWinningSessionDisplayHint", () => {
  let api, ctx;

  beforeEach(() => {
    ctx = makeCtx();
    api = initState(ctx);
  });
  afterEach(() => { api.cleanup(); });

  it("returns null-like SVG for working with no sessions and no hints", () => {
    // No sessions -> getWinningSessionDisplayHint returns null -> getWorkingSvg
    assert.ok(api.getSvgOverride("working") !== null);
  });

  it("returns resolved hint SVG for working session with displayHint", () => {
    ctx.theme = {
      ..._defaultTheme,
      displayHintMap: { building: "clawd-working-building.svg" },
    };
    api.refreshTheme();

    api.sessions.set("s1", rawSession("working", { displayHint: "building" }));
    assert.strictEqual(api.getSvgOverride("working"), "clawd-working-building.svg");
  });

  it("falls back to tier/default when displayHint is not in map", () => {
    ctx.theme = { ..._defaultTheme, displayHintMap: {} };
    api.refreshTheme();

    api.sessions.set("s1", rawSession("working", { displayHint: "unknown-hint" }));
    // Hint not in map -> null returned -> falls through to getWorkingSvg
    assert.strictEqual(api.getSvgOverride("working"), api.STATE_SVGS.working[0]);
  });

  it("picks session with highest updatedAt when multiple working sessions have hints", () => {
    ctx.theme = {
      ..._defaultTheme,
      displayHintMap: {
        typing: "clawd-working-typing.svg",
        building: "clawd-working-building.svg",
      },
    };
    api.refreshTheme();

    const older = Date.now() - 5000;
    const newer = Date.now();
    api.sessions.set("s1", rawSession("working", { displayHint: "typing", updatedAt: older }));
    api.sessions.set("s2", rawSession("working", { displayHint: "building", updatedAt: newer }));
    // s2 is newer -> its hint wins
    assert.strictEqual(api.getSvgOverride("working"), "clawd-working-building.svg");
  });

  it("excludes headless sessions from hint resolution", () => {
    ctx.theme = {
      ..._defaultTheme,
      displayHintMap: { building: "clawd-working-building.svg" },
    };
    api.refreshTheme();

    api.sessions.set("s1", rawSession("working", { displayHint: "building", headless: true }));
    // Headless excluded -> no hint found -> fallback
    assert.strictEqual(api.getSvgOverride("working"), api.STATE_SVGS.working[0]);
  });

  it("ignores sessions in wrong state for hint resolution", () => {
    ctx.theme = {
      ..._defaultTheme,
      displayHintMap: { building: "clawd-working-building.svg" },
    };
    api.refreshTheme();

    api.sessions.set("s1", rawSession("thinking", { displayHint: "building" }));
    // thinking session -> getWinningSessionDisplayHint("working") skips it
    assert.strictEqual(api.getSvgOverride("working"), api.STATE_SVGS.working[0]);
  });

  it("returns hinted SVG for thinking state", () => {
    ctx.theme = {
      ..._defaultTheme,
      displayHintMap: { deepThink: "clawd-working-deep-think.svg" },
    };
    api.refreshTheme();

    api.sessions.set("s1", rawSession("thinking", { displayHint: "deepThink" }));
    assert.strictEqual(api.getSvgOverride("thinking"), "clawd-working-deep-think.svg");
  });

  it("returns hinted SVG for juggling state", () => {
    ctx.theme = {
      ..._defaultTheme,
      displayHintMap: { multiTask: "clawd-working-conducting.svg" },
    };
    api.refreshTheme();

    api.sessions.set("s1", rawSession("juggling", { displayHint: "multiTask" }));
    assert.strictEqual(api.getSvgOverride("juggling"), "clawd-working-conducting.svg");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getSvgOverride() — base state overrides
// ═════════════════════════════════════════════════════════════════════════════

describe("getSvgOverride() — base states", () => {
  let api;

  beforeEach(() => { api = initState(makeCtx()); });
  afterEach(() => { api.cleanup(); });

  it("returns idle follow SVG for idle state", () => {
    const svg = api.getSvgOverride("idle");
    assert.ok(svg.includes("idle"));
    assert.ok(svg.includes("follow"));
  });

  it("returns thinking SVG for thinking state with no sessions", () => {
    const svg = api.getSvgOverride("thinking");
    assert.ok(svg.includes("thinking"));
  });

  it("returns null for states with no special override", () => {
    assert.strictEqual(api.getSvgOverride("error"), null);
    assert.strictEqual(api.getSvgOverride("sleeping"), null);
    assert.strictEqual(api.getSvgOverride("notification"), null);
    assert.strictEqual(api.getSvgOverride("attention"), null);
    assert.strictEqual(api.getSvgOverride("carrying"), null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildSessionSubmenu()
// ═════════════════════════════════════════════════════════════════════════════

describe("buildSessionSubmenu()", () => {
  let api, ctx;

  beforeEach(() => {
    ctx = makeCtx();
    api = initState(ctx);
  });
  afterEach(() => { api.cleanup(); });

  it("returns 'no sessions' entry when sessions Map is empty", () => {
    const items = api.buildSessionSubmenu();
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].label, "noSessions");
    assert.strictEqual(items[0].enabled, false);
  });

  it("returns entries sorted by priority (higher first) then by updatedAt (newer first)", () => {
    const t0 = Date.now() - 10000;
    const t1 = Date.now() - 5000;
    const t2 = Date.now();

    // working(3), thinking(2), idle(1)
    api.sessions.set("s1", rawSession("working", { updatedAt: t0, cwd: "/proj/a" }));
    api.sessions.set("s2", rawSession("thinking", { updatedAt: t2, cwd: "/proj/b" }));
    api.sessions.set("s3", rawSession("idle", { updatedAt: t1, cwd: "/proj/c" }));

    const items = api.buildSessionSubmenu();
    assert.strictEqual(items.length, 3);

    // working (priority 3) should be first
    assert.ok(items[0].label.includes("a"));
    // thinking (priority 2) second
    assert.ok(items[1].label.includes("b"));
    // idle (priority 1) last
    assert.ok(items[2].label.includes("c"));
  });

  it("sorts by updatedAt (newer first) within same priority", () => {
    const older = Date.now() - 5000;
    const newer = Date.now();

    api.sessions.set("s1", rawSession("working", { updatedAt: older, cwd: "/proj/older" }));
    api.sessions.set("s2", rawSession("working", { updatedAt: newer, cwd: "/proj/newer" }));

    const items = api.buildSessionSubmenu();
    assert.ok(items[0].label.includes("newer"));
    assert.ok(items[1].label.includes("older"));
  });

  it("groups by host when remote sessions exist", () => {
    api.sessions.set("s1", rawSession("working", { host: null, cwd: "/local" }));
    api.sessions.set("s2", rawSession("working", { host: "dev.example.com", cwd: "/remote" }));

    const items = api.buildSessionSubmenu();
    // Should have local header + local entry + separator + remote header + remote entry
    assert.ok(items.length >= 4);
    // Check that host headers exist (filter out separator items without labels)
    const labels = items.filter((i) => i.label).map((i) => i.label);
    assert.ok(labels.some((l) => l.includes("sessionLocal")));
    assert.ok(labels.some((l) => l.includes("dev.example.com")));
  });

  it("does not group when all sessions are local (no host)", () => {
    api.sessions.set("s1", rawSession("working", { host: null, cwd: "/a" }));
    api.sessions.set("s2", rawSession("working", { host: null, cwd: "/b" }));

    const items = api.buildSessionSubmenu();
    // No group headers, just 2 flat items
    assert.strictEqual(items.length, 2);
    assert.ok(!items.some((i) => i.label && i.label.includes("sessionLocal")));
  });

  it("shows headless emoji prefix for headless sessions", () => {
    api.sessions.set("s1", rawSession("working", { headless: true, cwd: "/proj" }));

    const items = api.buildSessionSubmenu();
    assert.strictEqual(items.length, 1);
    assert.ok(items[0].label.startsWith("\u{1F916} "));
  });

  it("does not show headless emoji for non-headless sessions", () => {
    api.sessions.set("s1", rawSession("working", { headless: false, cwd: "/proj" }));

    const items = api.buildSessionSubmenu();
    assert.strictEqual(items.length, 1);
    assert.ok(!items[0].label.startsWith("\u{1F916} "));
  });

  it("uses path.basename of cwd as folder name", () => {
    api.sessions.set("s1", rawSession("working", { cwd: "/home/user/my-project" }));

    const items = api.buildSessionSubmenu();
    assert.strictEqual(items.length, 1);
    assert.ok(items[0].label.includes("my-project"));
  });

  it("disables entry when no sourcePid", () => {
    api.sessions.set("s1", rawSession("working", { sourcePid: null, cwd: "/proj" }));

    const items = api.buildSessionSubmenu();
    assert.strictEqual(items[0].enabled, false);
    assert.strictEqual(items[0].click, undefined);
  });

  it("enables entry and provides click when sourcePid exists", () => {
    api.sessions.set("s1", rawSession("working", { sourcePid: 12345, cwd: "/proj" }));

    const items = api.buildSessionSubmenu();
    assert.strictEqual(items[0].enabled, true);
    assert.strictEqual(typeof items[0].click, "function");
  });

  it("shows session ID suffix when showSessionId is true", () => {
    ctx.showSessionId = true;
    api.sessions.set("s1", rawSession("working", { cwd: "/proj" }));

    const items = api.buildSessionSubmenu();
    assert.ok(items[0].label.includes("#" + "s1".slice(-3)));
  });

  it("uses shortened id when no cwd", () => {
    api.sessions.set("long-session-id", rawSession("working", { cwd: "" }));

    const items = api.buildSessionSubmenu();
    assert.ok(items[0].label.includes("long-s.."));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// startStartupRecovery() / getStartupRecoveryActive()
// ═════════════════════════════════════════════════════════════════════════════

describe("startStartupRecovery() / getStartupRecoveryActive()", () => {
  let api;

  beforeEach(() => {
    mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
    api = initState(makeCtx());
  });
  afterEach(() => {
    api.cleanup();
    mock.timers.reset();
  });

  it("initially returns false", () => {
    assert.strictEqual(api.getStartupRecoveryActive(), false);
  });

  it("returns true after startStartupRecovery()", () => {
    api.startStartupRecovery();
    assert.strictEqual(api.getStartupRecoveryActive(), true);
  });

  it("returns false after STARTUP_RECOVERY_MAX_MS timeout", () => {
    api.startStartupRecovery();
    assert.strictEqual(api.getStartupRecoveryActive(), true);

    // STARTUP_RECOVERY_MAX_MS = 300000 (5 minutes)
    mock.timers.tick(300000);
    assert.strictEqual(api.getStartupRecoveryActive(), false);
  });

  it("cleanup clears the startup recovery timer without crashing", () => {
    api.startStartupRecovery();
    assert.strictEqual(api.getStartupRecoveryActive(), true);

    api.cleanup();
    // Tick to verify no crash from stale timer
    mock.timers.tick(300000);
  });
});
