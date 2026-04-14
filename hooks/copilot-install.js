#!/usr/bin/env node
// Merge Clawd Copilot CLI hooks into ~/.copilot/hooks/hooks.json (append-only, idempotent)
// Copilot CLI uses a dual bash/powershell format with timeoutSec.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { resolveNodeBin } = require("./server-config");
const { writeJsonAtomic, asarUnpackedPath } = require("./json-utils");

const MARKER = "copilot-hook.js";

const COPILOT_HOOK_EVENTS = [
  "sessionStart",
  "sessionEnd",
  "userPromptSubmitted",
  "preToolUse",
  "postToolUse",
  "errorOccurred",
  "agentStop",
  "subagentStart",
  "subagentStop",
  "preCompact",
];

/**
 * Build the Copilot-specific hook entry with dual bash/powershell commands.
 * @param {string} nodeBin - Absolute path to node binary
 * @param {string} hookScript - Absolute path to copilot-hook.js
 * @param {string} event - Event name
 * @returns {object} Hook entry object
 */
function buildCopilotHookEntry(nodeBin, hookScript, event) {
  const cmd = `"${nodeBin}" "${hookScript}" ${event}`;
  return {
    type: "command",
    bash: cmd,
    powershell: cmd,
    timeoutSec: 5,
  };
}

/**
 * Register Clawd hooks into ~/.copilot/hooks/hooks.json
 * @param {object} [options]
 * @param {boolean} [options.silent]
 * @param {string} [options.hooksPath]
 * @returns {{ added: number, skipped: number, updated: number }}
 */
function registerCopilotHooks(options = {}) {
  const hooksPath = options.hooksPath || path.join(os.homedir(), ".copilot", "hooks", "hooks.json");

  // Skip if ~/.copilot/ doesn't exist (Copilot CLI not installed) — unless caller overrides path
  if (!options.hooksPath) {
    const copilotDir = path.dirname(path.dirname(hooksPath));
    let exists = false;
    try { exists = fs.statSync(copilotDir).isDirectory(); } catch {}
    if (!exists) {
      if (!options.silent) console.log("Clawd: ~/.copilot/ not found — skipping Copilot hook registration");
      return { added: 0, skipped: 0, updated: 0 };
    }
  }

  const hookScript = asarUnpackedPath(path.resolve(__dirname, "copilot-hook.js").replace(/\\/g, "/"));

  // Resolve node path; if detection fails, fall back to bare "node"
  const resolved = options.nodeBin !== undefined ? options.nodeBin : resolveNodeBin();
  const nodeBin = resolved || "node";

  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(hooksPath, "utf-8"));
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw new Error(`Failed to read hooks.json: ${err.message}`);
    }
  }

  if (!settings.hooks || typeof settings.hooks !== "object") settings.hooks = {};
  if (typeof settings.version !== "number") settings.version = 1;

  let added = 0;
  let skipped = 0;
  let updated = 0;
  let changed = false;

  for (const event of COPILOT_HOOK_EVENTS) {
    const desiredEntry = buildCopilotHookEntry(nodeBin, hookScript, event);

    if (!Array.isArray(settings.hooks[event])) {
      settings.hooks[event] = [];
      changed = true;
    }

    const arr = settings.hooks[event];
    let found = false;
    let stale = false;
    for (const entry of arr) {
      if (!entry || typeof entry !== "object") continue;
      // Match by marker presence in bash or powershell command
      const bash = entry.bash || "";
      const ps = entry.powershell || "";
      if (!bash.includes(MARKER) && !ps.includes(MARKER)) continue;
      found = true;
      if (bash !== desiredEntry.bash || ps !== desiredEntry.powershell) {
        entry.bash = desiredEntry.bash;
        entry.powershell = desiredEntry.powershell;
        entry.type = desiredEntry.type;
        entry.timeoutSec = desiredEntry.timeoutSec;
        stale = true;
      }
      break;
    }

    if (found) {
      if (stale) {
        updated++;
        changed = true;
      } else {
        skipped++;
      }
      continue;
    }

    arr.push(desiredEntry);
    added++;
    changed = true;
  }

  if (added > 0 || changed) {
    // Ensure parent directory exists (~/.copilot/hooks/)
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    writeJsonAtomic(hooksPath, settings);
  }

  if (!options.silent) {
    console.log(`Clawd Copilot hooks -> ${hooksPath}`);
    console.log(`  Added: ${added}, updated: ${updated}, skipped: ${skipped}`);
  }

  return { added, skipped, updated };
}

module.exports = { registerCopilotHooks, COPILOT_HOOK_EVENTS };

if (require.main === module) {
  try {
    registerCopilotHooks({});
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
