#!/usr/bin/env node
// Clawd Desktop Pet — Hook Uninstaller
// Removes Clawd hooks from all agent config files:
//   ~/.claude/settings.json (Claude Code)
//   ~/.copilot/hooks/hooks.json (Copilot CLI)
//   ~/.cursor/hooks.json (Cursor Agent)
//   ~/.gemini/settings.json (Gemini CLI)
//   ~/.kiro/agents/clawd.json (Kiro CLI — removes the clawd agent file)
//   ~/.config/opencode/opencode.json (opencode plugin)
//
// Safe to run multiple times. Only removes Clawd's own entries, never
// touches other hooks or settings.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { writeJsonAtomic } = require("./json-utils");

const HOME = os.homedir();

// ── Markers used to identify Clawd entries ──────────────────────────────────

const CLAUDE_MARKER = "clawd-hook.js";
const AUTO_START_MARKER = "auto-start.js";
const LEGACY_AUTO_START_MARKER = "auto-start.sh";
const PERMISSION_MARKER = "/permission";
const COPILOT_MARKER = "copilot-hook.js";
const CURSOR_MARKER = "cursor-hook.js";
const GEMINI_MARKER = "gemini-hook.js";
const KIRO_MARKER = "kiro-hook.js";
const OPENCODE_MARKER = "opencode-plugin";

// ── Helper: remove entries from a hooks array matching a predicate ──────────

function filterHooksArray(arr, predicate) {
  if (!Array.isArray(arr)) return { arr, removed: 0 };
  const kept = [];
  let removed = 0;
  for (const entry of arr) {
    if (predicate(entry)) {
      removed++;
    } else {
      kept.push(entry);
    }
  }
  return { arr: kept, removed };
}

// ── Claude Code: ~/.claude/settings.json ────────────────────────────────────

function uninstallClaudeHooks() {
  const settingsPath = path.join(HOME, ".claude", "settings.json");
  let removed = 0;
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(raw);
    if (!settings.hooks) return { removed: 0, path: settingsPath };

    for (const event of Object.keys(settings.hooks)) {
      const arr = settings.hooks[event];
      if (!Array.isArray(arr)) continue;

      const result = filterHooksArray(arr, (entry) => {
        if (!entry || typeof entry !== "object") return false;
        // Check command in nested format
        if (typeof entry.command === "string") {
          if (entry.command.includes(CLAUDE_MARKER) ||
              entry.command.includes(AUTO_START_MARKER) ||
              entry.command.includes(LEGACY_AUTO_START_MARKER)) return true;
        }
        // Check nested hooks[].command
        if (Array.isArray(entry.hooks)) {
          const hasClawd = entry.hooks.some((h) => {
            if (!h || typeof h !== "object") return false;
            const cmd = h.command || "";
            return cmd.includes(CLAUDE_MARKER) ||
                   cmd.includes(AUTO_START_MARKER) ||
                   cmd.includes(LEGACY_AUTO_START_MARKER);
          });
          // HTTP hook (permission)
          const hasHttp = entry.hooks.some((h) => {
            if (!h || typeof h !== "object") return false;
            return (h.type === "http") && typeof h.url === "string" && h.url.includes(PERMISSION_MARKER);
          });
          if (hasClawd || hasHttp) return true;
        }
        // Top-level HTTP hook
        if (entry.type === "http" && typeof entry.url === "string" && entry.url.includes(PERMISSION_MARKER)) {
          return true;
        }
        return false;
      });

      removed += result.removed;
      if (result.arr.length === 0) {
        delete settings.hooks[event];
      } else {
        settings.hooks[event] = result.arr;
      }
    }

    // Clean up empty hooks object
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    writeJsonAtomic(settingsPath, settings);
  } catch (err) {
    if (err.code !== "ENOENT") {
      return { removed: 0, path: settingsPath, error: err.message };
    }
    return { removed: 0, path: settingsPath, skipped: true };
  }
  return { removed, path: settingsPath };
}

// ── Copilot CLI: ~/.copilot/hooks/hooks.json ───────────────────────────────

function uninstallCopilotHooks() {
  const hooksPath = path.join(HOME, ".copilot", "hooks", "hooks.json");
  let removed = 0;
  try {
    const raw = fs.readFileSync(hooksPath, "utf-8");
    const settings = JSON.parse(raw);
    if (!settings.hooks) return { removed: 0, path: hooksPath };

    for (const event of Object.keys(settings.hooks)) {
      const arr = settings.hooks[event];
      const result = filterHooksArray(arr, (entry) => {
        if (!entry || typeof entry !== "object") return false;
        const bash = entry.bash || "";
        const ps = entry.powershell || "";
        return bash.includes(COPILOT_MARKER) || ps.includes(COPILOT_MARKER);
      });
      removed += result.removed;
      if (result.arr.length === 0) {
        delete settings.hooks[event];
      } else {
        settings.hooks[event] = result.arr;
      }
    }

    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    writeJsonAtomic(hooksPath, settings);
  } catch (err) {
    if (err.code !== "ENOENT") return { removed: 0, path: hooksPath, error: err.message };
    return { removed: 0, path: hooksPath, skipped: true };
  }
  return { removed, path: hooksPath };
}

// ── Cursor Agent: ~/.cursor/hooks.json ─────────────────────────────────────

function uninstallCursorHooks() {
  const hooksPath = path.join(HOME, ".cursor", "hooks.json");
  let removed = 0;
  try {
    const raw = fs.readFileSync(hooksPath, "utf-8");
    const settings = JSON.parse(raw);
    if (!settings.hooks) return { removed: 0, path: hooksPath };

    for (const event of Object.keys(settings.hooks)) {
      const arr = settings.hooks[event];
      const result = filterHooksArray(arr, (entry) => {
        if (!entry || typeof entry !== "object") return false;
        const cmd = entry.command || "";
        return cmd.includes(CURSOR_MARKER);
      });
      removed += result.removed;
      if (result.arr.length === 0) {
        delete settings.hooks[event];
      } else {
        settings.hooks[event] = result.arr;
      }
    }

    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    writeJsonAtomic(hooksPath, settings);
  } catch (err) {
    if (err.code !== "ENOENT") return { removed: 0, path: hooksPath, error: err.message };
    return { removed: 0, path: hooksPath, skipped: true };
  }
  return { removed, path: hooksPath };
}

// ── Gemini CLI: ~/.gemini/settings.json ────────────────────────────────────

function uninstallGeminiHooks() {
  const settingsPath = path.join(HOME, ".gemini", "settings.json");
  let removed = 0;
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(raw);
    if (!settings.hooks) return { removed: 0, path: settingsPath };

    for (const event of Object.keys(settings.hooks)) {
      const arr = settings.hooks[event];
      const result = filterHooksArray(arr, (entry) => {
        if (!entry || typeof entry !== "object") return false;
        const cmd = entry.command || "";
        return cmd.includes(GEMINI_MARKER);
      });
      removed += result.removed;
      if (result.arr.length === 0) {
        delete settings.hooks[event];
      } else {
        settings.hooks[event] = result.arr;
      }
    }

    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    writeJsonAtomic(settingsPath, settings);
  } catch (err) {
    if (err.code !== "ENOENT") return { removed: 0, path: settingsPath, error: err.message };
    return { removed: 0, path: settingsPath, skipped: true };
  }
  return { removed, path: settingsPath };
}

// ── Kiro CLI: ~/.kiro/agents/clawd.json ────────────────────────────────────

function uninstallKiroHooks() {
  const agentPath = path.join(HOME, ".kiro", "agents", "clawd.json");
  try {
    if (!fs.existsSync(agentPath)) {
      return { removed: 0, path: agentPath, skipped: true };
    }
    fs.unlinkSync(agentPath);
    return { removed: 1, path: agentPath };
  } catch (err) {
    return { removed: 0, path: agentPath, error: err.message };
  }
}

// ── opencode: ~/.config/opencode/opencode.json ─────────────────────────────

function uninstallOpencodePlugin() {
  const configPath = path.join(HOME, ".config", "opencode", "opencode.json");
  let removed = 0;
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    if (!Array.isArray(config.plugin)) return { removed: 0, path: configPath };

    const before = config.plugin.length;
    config.plugin = config.plugin.filter((p) => {
      if (typeof p !== "string") return true;
      return !p.includes(OPENCODE_MARKER);
    });
    removed = before - config.plugin.length;

    if (removed > 0) writeJsonAtomic(configPath, config);
  } catch (err) {
    if (err.code !== "ENOENT") return { removed: 0, path: configPath, error: err.message };
    return { removed: 0, path: configPath, skipped: true };
  }
  return { removed, path: configPath };
}

// ── Main ────────────────────────────────────────────────────────────────────

/**
 * Uninstall all Clawd hooks from all agent config files.
 * @param {object} [options]
 * @param {boolean} [options.silent]
 * @returns {{ total: number, results: Array<{ agent: string, removed: number, path: string, error?: string, skipped?: boolean }> }}
 */
function uninstallAllHooks(options = {}) {
  const results = [
    { agent: "Claude Code", ...uninstallClaudeHooks() },
    { agent: "Copilot CLI", ...uninstallCopilotHooks() },
    { agent: "Cursor Agent", ...uninstallCursorHooks() },
    { agent: "Gemini CLI", ...uninstallGeminiHooks() },
    { agent: "Kiro CLI", ...uninstallKiroHooks() },
    { agent: "opencode", ...uninstallOpencodePlugin() },
  ];

  const total = results.reduce((sum, r) => sum + r.removed, 0);

  if (!options.silent) {
    console.log("Clawd hook uninstall:");
    for (const r of results) {
      if (r.skipped) {
        console.log(`  ${r.agent}: not found (${r.path})`);
      } else if (r.error) {
        console.log(`  ${r.agent}: ERROR — ${r.error}`);
      } else if (r.removed > 0) {
        console.log(`  ${r.agent}: removed ${r.removed} hook(s)`);
      } else {
        console.log(`  ${r.agent}: clean (no Clawd hooks)`);
      }
    }
    console.log(`Total: ${total} hook(s) removed`);
  }

  return { total, results };
}

module.exports = {
  uninstallAllHooks,
  uninstallClaudeHooks,
  uninstallCopilotHooks,
  uninstallCursorHooks,
  uninstallGeminiHooks,
  uninstallKiroHooks,
  uninstallOpencodePlugin,
};

if (require.main === module) {
  try {
    uninstallAllHooks();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
