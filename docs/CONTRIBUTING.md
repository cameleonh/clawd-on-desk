# Contributing to Clawd on Desk

Thank you for your interest in contributing! This guide covers setting up your development environment and submitting changes.

## Development Setup

### Prerequisites

- **Node.js** >= 18
- **Git**
- **Platform-specific**: Windows 11, macOS 12+, or Ubuntu 22+

### Installation

```bash
git clone https://github.com/rullerzhou-afk/clawd-on-desk.git
cd clawd-on-desk
npm install
```

### Running

```bash
npm start
```

This launches the Electron app in development mode. Claude Code and Codex CLI hooks are auto-registered on first launch.

### Testing

```bash
# Run all tests
npm test

# Run a specific test file
node --test test/state.test.js

# Run tests matching a pattern
node --test --test-name-pattern="resolveDisplayState" test/state.test.js
```

Tests use the **Node.js built-in test runner** (`node:test` + `node:assert`). No additional test framework needed.

### Manual Testing

Shell scripts for testing specific features (not distributed with releases):

```bash
bash test-demo.sh [seconds]   # Cycle through all SVG animations
bash test-mini.sh [seconds]   # Test mini mode animations
bash test-bubble.sh           # Test permission bubble stacking
```

Manual state injection via curl:
```bash
curl -X POST http://127.0.0.1:23333/state \
  -H "Content-Type: application/json" \
  -d '{"state":"thinking","session_id":"test"}'
```

## Project Structure

```
src/             → Electron source (main process + renderers)
  main.js          Main process entry
  state.js         State machine core
  server.js        HTTP server for hooks
  permission.js    Permission bubble management
  renderer.js      Render process (SVG display)
  hit-renderer.js  Input window (pointer events)
  mini.js          Mini mode logic
  menu.js          Context menu + tray
  tick.js          50ms main loop
  settings-*.js    Settings panel
agents/          → Agent config modules (one per supported agent)
hooks/           → Agent hook scripts (run as child processes by agents)
themes/          → Built-in themes (clawd, calico) + template
test/            → Unit tests (node --test)
docs/            → Documentation
assets/          → SVG animations, sounds, icons (NOT MIT licensed)
```

## Code Style

- **JavaScript** (CommonJS modules, `"type": "commonjs"` in package.json)
- No TypeScript, no bundler, no transpiler
- Follow existing patterns in the file you are editing
- Keep files focused — avoid growing a single file beyond ~800 lines
- Use `const`/`let`, never `var`
- Use `===` strict equality
- No unused imports or variables

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new agent support
fix: resolve mini mode edge snap on multi-monitor
docs: update known limitations
refactor: simplify state priority resolution
test: add server route integration tests
chore: update electron dependency
```

## Pull Request Process

1. **Fork** the repository
2. **Create a branch** from `main`: `git checkout -b feat/my-feature`
3. **Make changes** with clear, atomic commits
4. **Add tests** for new logic (unit tests in `test/`)
5. **Run tests**: `npm test` — all must pass
6. **Test manually** if changing Electron windows, animations, or agent hooks
7. **Update docs** if adding features or changing behavior
8. **Submit PR** with a clear description of what and why

### PR Checklist

- [ ] Tests pass (`npm test`)
- [ ] Manual testing done (for UI/animation changes)
- [ ] Documentation updated (if applicable)
- [ ] No unnecessary dependencies added
- [ ] Commit messages follow Conventional Commits

## Adding a New Agent

1. Create `agents/<name>.js` exporting event mapping + capabilities
2. Create `hooks/<name>-hook.js` for hook-based agents, or log monitor for polling agents
3. Create `hooks/<name>-install.js` for auto-registration
4. Add test file: `test/<name>-install.test.js`
5. Update this guide and `docs/known-limitations.md`

## Reporting Issues

Open a [GitHub issue](https://github.com/rullerzhou-76352162/clawd-on-desk/issues) with:
- Clawd version (check `package.json` version field)
- Agent(s) affected
- OS and version
- Steps to reproduce
- Expected vs actual behavior
