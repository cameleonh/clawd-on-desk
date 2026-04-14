# Product Requirements Document: Clawd on Desk

**Version:** 0.5.10
**Last Updated:** 2026-04-14
**Status:** Active Development

---

## 1. Product Vision

Clawd on Desk is an Electron desktop pet that provides real-time visual feedback for AI coding agent sessions. It lives on-screen as an animated character -- thinking when you prompt, typing when tools run, juggling subagents, reviewing permissions, celebrating completions, and sleeping when you are away. The core value proposition is **at-a-glance status awareness without switching windows**: developers running one or more AI coding agents can see what their agents are doing from the corner of their eye, act on permission requests without leaving their editor, and enjoy a lightweight companion that stays out of the way until it matters.

The application ships with two built-in themes -- Clawd (pixel crab) and Calico (calico cat) -- and supports fully custom themes via SVG/GIF/APNG assets. It integrates with seven AI coding agents: Claude Code, Codex CLI, Copilot CLI, Cursor Agent, Gemini CLI, Kiro CLI, and opencode, all running simultaneously with independent session tracking.

---

## 2. Target Users

| Persona | Description | Primary Needs |
|---------|-------------|---------------|
| **Daily Agent User** | Developer who runs one AI coding agent (typically Claude Code) for hours each day | Visual awareness of agent state without terminal checking; quick permission approvals; ambient companionship |
| **Multi-Agent Developer** | Power user running 2+ agents concurrently (e.g., Claude Code + Codex + opencode) | Unified status dashboard across agents; per-session terminal focus; priority-based state resolution showing the most important activity |
| **Theme Creator** | Designer or community member building custom character themes | Clear theme specification; SVG eye-tracking conventions; validation tooling; tiered creation path (beginner to advanced) |
| **Contributor** | Open-source developer extending agent support, fixing bugs, or adding features | Well-documented architecture; agent config modules; hook registration patterns; test infrastructure |

---

## 3. Feature Requirements

### 3.1 State Machine

**REQ-SM-001: Priority-Based State Resolution**

The state machine (`src/state.js`) maintains a `sessions` Map keyed by `session_id`, with each session independently recording its current state. `resolveDisplayState()` picks the highest-priority state across all active sessions to determine the displayed animation.

| Priority | State | Description |
|----------|-------|-------------|
| 8 | error | Tool failure or session error |
| 7 | notification | User-facing notification or elicitation |
| 6 | sweeping | Context compaction in progress |
| 5 | attention | Task completed (happy celebration) |
| 4 | carrying / juggling | Worktree creation or subagent delegation |
| 3 | working | Tool execution in progress |
| 2 | thinking | Model generating response |
| 1 | idle | Waiting for input |
| 0 | sleeping | No activity or user away |

**REQ-SM-002: Working and Juggling Sub-States**

Working sub-states vary by the number of concurrent sessions:
- 1 session: **typing** (`clawd-working-typing.svg`)
- 2 sessions: **juggling** (`clawd-working-juggling.svg`)
- 3+ sessions: **building** (`clawd-working-building.svg`)

Juggling sub-states vary by subagent count:
- 1 subagent: **juggling** (`clawd-working-juggling.svg`)
- 2+ subagents: **conducting** (`clawd-working-conducting.svg`)

**REQ-SM-003: Minimum Display Times**

To prevent rapid state flickering, each state enforces a minimum display duration before transitioning:

| State | Minimum Duration |
|-------|-----------------|
| error | 5 seconds |
| attention | 4 seconds |
| notification | 4 seconds |
| carrying | 3 seconds |
| sweeping | 2 seconds |
| working | 1 second |
| thinking | 1 second |

One-shot states (attention, error, sweeping, notification, carrying) automatically revert via `AUTO_RETURN_MS` after their minimum duration elapses.

**REQ-SM-004: Sleep Sequence and DND Mode**

Sleep sequence (natural):
1. 20 seconds of mouse stillness: transition to `idle-look` (looking around)
2. 60 seconds of continued stillness: `yawning` (3 seconds)
3. Transition to `dozing`
4. 10 minutes of continued stillness: `collapsing` (0.8 seconds)
5. Transition to `sleeping`
6. Mouse movement triggers `waking` (1.5 seconds) then restores previous state

Do Not Disturb (DND) mode:
- Activated via right-click menu or tray menu "Sleep (DND)"
- Skips the `dozing` phase entirely (goes straight from `yawning` to `collapsing` to `sleeping`)
- Suppresses all hook events; permission requests are auto-denied without displaying bubbles
- Wake triggers the `waking` animation before resuming normal operation

---

### 3.2 Agent Integration

**REQ-AG-001: Multi-Agent Architecture**

Each supported agent is defined as a configuration module in the `agents/` directory, exporting event mappings, process names, and capability declarations. The registry (`agents/registry.js`) resolves agents by ID or process name.

**REQ-AG-002: Supported Agents**

| Agent | Integration Method | Latency | Permission Bubbles | Terminal Focus | Auto-Register |
|-------|--------------------|---------|--------------------|----------------|---------------|
| Claude Code | HTTP command hooks + HTTP permission hooks | ~0ms | Full (Allow/Deny/Suggestions) | Yes (process tree walk) | Yes (`hooks/install.js`) |
| Codex CLI | JSONL log polling (`~/.codex/sessions/`) | ~1.5s | Notify only (Dismiss) | No | N/A (automatic polling) |
| Copilot CLI | Command hooks via `~/.copilot/hooks/hooks.json` | ~0ms | No | No | Manual |
| Cursor Agent | hooks.json stdin/stdout JSON | ~0ms | No | No | Auto (`hooks/cursor-install.js`) |
| Gemini CLI | Session JSON polling (`~/.gemini/tmp/`) | ~1.5s poll + 4s defer | No | No | Auto (`hooks/gemini-install.js`) |
| Kiro CLI | Agent config hooks in `~/.kiro/agents/` | ~0ms | No | No | Auto (`hooks/kiro-hooks`) |
| opencode | In-process plugin + reverse HTTP bridge | ~0ms | Full (Allow/Always/Deny) | Yes (in-process PID) | Auto (`hooks/opencode-install.js`) |

**REQ-AG-003: Hook Registration**

- Claude Code hooks register to `~/.claude/settings.json` on startup via `registerHooks()`, appending to existing hook arrays without overwriting
- Cursor, Gemini, Kiro, and opencode hooks register to their respective config files via dedicated install scripts
- Hook scripts are zero-dependency Node.js scripts using only built-in modules and a shared `server-config.js` for port discovery
- HTTP server listens on `127.0.0.1:23333-23337` range, with runtime port written to `~/.clawd/runtime.json`

**REQ-AG-004: Remote SSH Support**

Agents running on remote servers can relay state updates through SSH reverse port forwarding (`CLAWD_REMOTE=1` mode skips PID collection).

---

### 3.3 Permission Bubble System

**REQ-PB-001: Claude Code Permission Flow**

1. Claude Code triggers `PermissionRequest` event (HTTP hook type, blocking with 600s timeout)
2. `POST /permission` receives `{ tool_name, tool_input, session_id, permission_suggestions }`
3. Main process creates a bubble `BrowserWindow` (transparent, frameless, always-on-top) loading `bubble.html`
4. User clicks Allow, Deny, or a suggestion button
5. HTTP response `{ behavior }` returns the decision to Claude Code
6. If the client disconnects (timeout or terminal-side answer), `res.on("close")` auto-dismisses the bubble

**REQ-PB-002: opencode Permission Flow**

1. opencode triggers `permission.asked` event hook in the in-process plugin
2. Plugin POSTs to `/permission` with `bridge_url` and `bridge_token`
3. Clawd immediately returns 200 ACK (non-blocking) and creates a bubble window
4. User makes a decision (Allow / Always / Deny)
5. Clawd POSTs the decision to the plugin's reverse Bun.serve bridge (random port, `timingSafeEqual` auth)
6. Bridge calls opencode's in-process Hono route `/permission/:id/reply`
7. opencode executes the corresponding behavior (once/always/reject)

**REQ-PB-003: Bubble Stacking and Layout**

- Multiple permission bubbles stack upward from the screen's bottom-right corner
- Each bubble reports its rendered height via IPC `bubble-height` message
- `repositionBubbles()` dynamically recalculates positions for precise stacking
- Codex notification bubbles show only a Dismiss button and auto-expire after 30 seconds

**REQ-PB-004: Global Hotkeys and Auto-Dismiss**

- `Ctrl+Shift+Y`: Allow the latest actionable bubble (excludes elicitation, Codex notify, ExitPlanMode)
- `Ctrl+Shift+N`: Deny the latest actionable bubble
- Hotkeys are registered only while bubbles are visible and unregistered when all bubbles are hidden or the pet is hidden
- Auto-dismiss: bubbles disappear when the client disconnects or the user answers in the terminal
- DND mode: all permission requests are auto-denied without displaying bubbles; opencode falls back to its built-in TUI prompt

---

### 3.4 Animation and Interaction

**REQ-AN-001: Dual-Window Architecture**

The desktop pet uses two independent top-level windows:
- **Render window**: Large transparent window with `setIgnoreMouseEvents(true)` (click-through), displaying SVG animations and eye tracking
- **Input window (hitWin)**: Small rectangular window with `transparent: true` and `setShape` covering the hitbox area, `focusable: true`, capturing all pointer events

Input events flow: hitWin renderer -> IPC -> main process (moves both windows + relays) -> renderWin renderer (plays reaction animations).

This architecture resolves a Windows-specific drag failure where `WS_EX_NOACTIVATE` + layered window + Chromium child HWND combinations cause click activation dead paths.

**REQ-AN-002: SVG Animation States**

12 animated states rendered as SVG via `<object type="image/svg+xml">` (required for internal DOM access for eye tracking):

| State | SVG File | Description |
|-------|----------|-------------|
| idle | `clawd-idle-follow.svg` | Eye tracking, occasional random living animations |
| thinking | `clawd-working-thinking.svg` | Processing user prompt |
| typing | `clawd-working-typing.svg` | Single-session tool execution |
| building | `clawd-working-building.svg` | Three or more concurrent sessions |
| juggling | `clawd-working-juggling.svg` | Two sessions or one subagent |
| conducting | `clawd-working-conducting.svg` | Two or more subagents |
| error | `clawd-error.svg` | Tool failure |
| happy | `clawd-happy.svg` | Task completion celebration |
| notification | `clawd-notification.svg` | User notification |
| sweeping | `clawd-working-sweeping.svg` | Context compaction |
| carrying | `clawd-working-carrying.svg` | Worktree creation |
| sleeping | `clawd-sleeping.svg` | Inactive / away |

GIF/APNG fallback is supported for themes that do not provide SVG assets.

**REQ-AN-003: Eye Tracking and Cursor Awareness**

- Tick loop polls cursor position every 50ms (~20fps)
- Calculates eye offset (MAX_OFFSET=3px, quantized to 0.5px grid)
- Sends `{dx, dy}` via IPC `eye-move` to renderer
- Renderer manipulates SVG internal DOM: `#eyes-js` translate + `#body-js` slight lean + `#shadow-js` stretch
- Dedup optimization: skips IPC send when cursor has not moved; `forceEyeResend` bypass for state transitions

**REQ-AN-004: Click Reactions and Drag**

- Double-click: poke reaction (left/right direction detection, 2.5s duration, `react-left`/`react-right` SVG)
- 4 clicks: flail reaction (3.5s duration, `react-double` SVG)
- Drag: Pointer Capture prevents fast-flick drops; drag threshold is 3px; resumes animation on release
- Reaction animations detach eye tracking during playback, reattach on completion
- Drag threshold: mouse displacement > 3px triggers drag mode, otherwise treated as click

**REQ-AN-005: Mini Mode**

Edge-snap mode where the character hides at the right screen edge:
- Enter: drag to right edge (30px snap tolerance) triggers fast slide-in + `mini-enter` animation; right-click menu also available
- Peek-on-hover: cursor over hidden pet triggers slide-out; cursor leaves triggers slide-back
- Mini state mappings: idle, enter, peek, alert, happy, crabwalk, enter-sleep, sleep
- Parabolic jump transitions using `animateWindowParabola()` with `setPosition()` to avoid DPI drift
- Position persisted across restarts via `clawd-prefs.json`

---

### 3.5 Settings Panel

**Current Settings:**
- Agent manager showing registered and active agents
- Per-agent permission bubble toggle
- Three-layer interception system (hook -> bubble -> terminal fallback)

**Planned Settings (Roadmap):**
- Theme preview gallery with live switching
- Hotkey configuration interface
- Per-agent animation tuning (e.g., minimum display time overrides)
- Accessibility options (reduced motion, high contrast, larger hitbox)
- Settings import/export for profile portability

---

### 3.6 System Features

**Tray Menu:**
- Resize: Small / Medium / Large
- Do Not Disturb toggle
- Language switch (English / Chinese)
- Auto-start configuration
- Check for Updates
- Sound effects toggle

**Internationalization (i18n):**
- Supported languages: English (`en`) and Chinese (`zh`)
- Language preference persisted to `clawd-prefs.json`
- Permission bubble button labels follow language setting
- Switchable via right-click menu or tray menu

**Auto-Update:**
- GitHub Releases integration via `electron-updater`
- Windows: NSIS installer update on app quit (`autoInstallOnAppQuit = true`)
- macOS/Linux (git clone mode): `git fetch` + `git pull` + `npm install` (if dependencies changed) + `app.relaunch()`

**Position Memory:**
- Window coordinates and size persisted to `clawd-prefs.json`
- Multi-monitor boundary clamping via `clampToScreen()` using `getNearestWorkArea()`
- Mini mode position preserved across restarts

**Single Instance Lock:**
- `app.requestSingleInstanceLock()` prevents duplicate instances

**Sound Effects:**
- Short audio cues: `complete.mp3` on task completion (attention/mini-happy), `confirm.mp3` on notification (notification/mini-alert)
- 10-second cooldown between plays
- Auto-muted during DND mode
- Toggle via right-click menu
- `autoplay-policy: no-user-gesture-required` set before any window creation to bypass Chromium autoplay restrictions

**Auto-Start:**
- Claude Code's `SessionStart` hook can automatically launch Clawd if it is not already running
- `hooks/auto-start.js` detects Electron process and detached-spawns if absent, exiting in <500ms

---

## 4. Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-001 | State change latency (hook-based agents) | < 1 second from event to animation |
| NFR-002 | Memory footprint | < 150 MB resident |
| NFR-003 | Platform support | Windows 11, macOS (x64 + arm64), Linux (AppImage + deb) |
| NFR-004 | SVG security | Third-party theme SVGs automatically sanitized via `htmlparser2` |
| NFR-005 | Hook input validation | All external inputs (HTTP POST, stdin JSON, log files) validated before processing |
| NFR-006 | Test coverage | Core agent logic >= 80% (agents, log polling, hook registration, port discovery) |

---

## 5. Known Limitations

Refer to [`docs/known-limitations.md`](known-limitations.md) for the complete table. Top 5 gaps as of v0.5.10:

1. **Claude Code tools rejected when Clawd is offline** -- The `PermissionRequest` hook (registered by Clawd) fails with `ECONNREFUSED` when Clawd's HTTP server is not running. Claude Code currently denies the tool call instead of falling through to its built-in prompt, affecting `Edit`, `Write`, `Bash`, and other tools. Workaround: keep Clawd running, or temporarily rename the hook key in `~/.claude/settings.json`. Tracked as [anthropics/claude-code#46193](https://github.com/anthropics/claude-code/issues/46193).

2. **Codex CLI polling latency (~1.5s)** -- Codex hardcodes hooks off on Windows, requiring JSONL log polling with inherent ~1.5 second delay compared to near-instant hook-based agents. No terminal focus is available since logs do not carry terminal PID information.

3. **Gemini CLI lacks working state and permission bubbles** -- Gemini's session JSON only records completed messages, not in-progress tool execution. The pet jumps directly from thinking to happy/error with no typing animation. File polling cannot intercept approval requests, so no permission bubbles are available. Polling adds ~1.5s interval + 4s defer window latency.

4. **Copilot CLI requires manual hook setup** -- Copilot hooks require manually creating `~/.copilot/hooks/hooks.json`. The `preToolUse` hook only supports deny, not the full allow/deny flow, so permission bubbles do not work with Copilot.

5. **No automated Electron main process tests** -- Unit tests cover agents and log polling modules, but the Electron main process (state machine, windows, tray) has no automated test framework. Testing relies on manual verification and shell scripts (`test-demo.sh`, `test-mini.sh`, `test-sleep.sh`, `test-bubble.sh`).

---

## 6. Roadmap

### v0.6.0 -- Documentation and Tests
- ~~Comprehensive English documentation (PRD, contributing guide, architecture docs)~~
- ~~Expand unit test coverage for core modules~~
- Agent integration test harness

### v0.7.0 -- UX Polish
- Settings panel redesign with theme preview
- Hotkey configuration interface
- Accessibility options (reduced motion, high contrast)
- Settings import/export
- Language menu truncation investigation (Electron + Windows DWM limitation)

### v0.8.0 -- New Features
- Codex terminal focus via process tree lookup from `codex.exe` PID
- ~~Auto-registration of Copilot CLI hooks (like Claude Code)~~
- Theme registry and in-app download
- ~~Hook uninstall script for clean application removal~~

### v1.0.0 -- Production
- Performance optimization and memory profiling
- Full cross-platform CI/CD pipeline
- Electron main process test infrastructure
- Stable API for third-party agent integrations
- Complete accessibility audit
- Production-ready packaging and distribution

---

*This document is maintained alongside the codebase. For implementation details, refer to `CLAUDE.md` and inline code documentation.*
