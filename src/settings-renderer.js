"use strict";

// ── Settings panel renderer ──
//
// Strict unidirectional flow (plan §4.2):
//
//   1. UI clicks → settingsAPI.update(key, value) → main → controller
//   2. Controller commits → broadcasts settings-changed
//   3. settingsAPI.onChanged fires → renderUI() rebuilds the affected row(s)
//
// We never optimistically toggle a switch in the click handler. The visual
// state always reflects what the store says — period. Failures show a toast
// and the switch stays in its previous position because the store was never
// committed.

// ── i18n (mirror src/i18n.js — bubbles can't require electron modules) ──
const STRINGS = {
  en: {
    settingsTitle: "Settings",
    settingsSubtitle: "Configure how Clawd behaves on your desktop.",
    sidebarGeneral: "General",
    sidebarAgents: "Agents",
    sidebarTheme: "Theme",
    sidebarAnimMap: "Animation Map",
    sidebarShortcuts: "Shortcuts",
    sidebarAbout: "About",
    sidebarSoon: "Soon",
    sectionAppearance: "Appearance",
    sectionStartup: "Startup",
    sectionBubbles: "Bubbles",
    agentsTitle: "Agents",
    agentsSubtitle: "Turn tracking on or off per agent. Disabled agents stop log monitors and drop hook events at the HTTP boundary — they won't drive the pet, show permission bubbles, or keep sessions.",
    agentsEmpty: "No agents registered.",
    eventSourceHook: "Hook",
    eventSourceLogPoll: "Log poll",
    eventSourcePlugin: "Plugin",
    badgePermissionBubble: "Permission bubble",
    rowAgentPermissions: "Show pop-up bubbles",
    rowAgentPermissionsDesc: "Turn off to let this agent handle prompts in its own terminal instead of showing a Clawd bubble.",
    rowLanguage: "Language",
    rowLanguageDesc: "Interface language for menus and bubbles.",
    rowSound: "Sound effects",
    rowSoundDesc: "Play a chime when Clawd finishes a task or asks for input.",
    rowOpenAtLogin: "Open at login",
    rowOpenAtLoginDesc: "Start Clawd automatically when you log in.",
    rowStartWithClaude: "Start with Claude Code",
    rowStartWithClaudeDesc: "Auto-launch Clawd whenever a Claude Code session starts.",
    rowBubbleFollow: "Bubbles follow Clawd",
    rowBubbleFollowDesc: "Place permission and update bubbles next to the pet instead of the screen corner.",
    rowHideBubbles: "Hide all bubbles",
    rowHideBubblesDesc: "Suppress permission, notification, and update bubbles entirely.",
    rowShowSessionId: "Show session ID",
    rowShowSessionIdDesc: "Append the short session ID to bubble headers and the Sessions menu.",
    toastSaveFailed: "Couldn't save: ",
    langEnglish: "English",
    langChinese: "中文",
    themeTabTitle: "Theme",
    themeTabSubtitle: "Choose the character that keeps you company while you code.",
    themeBuiltin: "Built-in",
    aboutTabTitle: "About Clawd on Desk",
    aboutVersion: "Version",
    aboutDescription: "A desktop pet that reacts to your AI coding agents in real-time.",
    aboutRepo: "GitHub Repository",
    aboutLicense: "License",
    aboutAgents: "Supported Agents",
    animMapTitle: "Animation Map",
    animMapSubtitle: "How agent events map to pet animations.",
    animMapEvent: "Event",
    animMapState: "State",
    animMapAnimation: "Animation",
    shortcutsTitle: "Keyboard Shortcuts",
    shortcutsSubtitle: "Current hotkey bindings. Customization coming in a future update.",
    shortcutsAction: "Action",
    shortcutsKey: "Shortcut",
    shortcutAllow: "Allow latest permission bubble",
    shortcutDeny: "Deny latest permission bubble",
    shortcutNotCustomizable: "Not customizable yet",
  },
  zh: {
    settingsTitle: "设置",
    settingsSubtitle: "配置 Clawd 在桌面上的行为。",
    sidebarGeneral: "通用",
    sidebarAgents: "Agent 管理",
    sidebarTheme: "主题",
    sidebarAnimMap: "动画映射",
    sidebarShortcuts: "快捷键",
    sidebarAbout: "关于",
    sidebarSoon: "待推出",
    sectionAppearance: "外观",
    sectionStartup: "启动",
    sectionBubbles: "气泡",
    agentsTitle: "Agent 管理",
    agentsSubtitle: "按 agent 类型开关追踪。关闭后会停掉日志监视器、在 HTTP 入口丢弃 hook 事件——不会再驱动桌宠、不弹权限气泡、不记会话。",
    agentsEmpty: "没有已注册的 agent。",
    eventSourceHook: "Hook",
    eventSourceLogPoll: "日志轮询",
    eventSourcePlugin: "插件",
    badgePermissionBubble: "权限气泡",
    rowAgentPermissions: "显示弹窗",
    rowAgentPermissionsDesc: "关闭后让该 agent 在自己的终端里处理提示，不再弹 Clawd 气泡。",
    rowLanguage: "语言",
    rowLanguageDesc: "菜单和气泡的界面语言。",
    rowSound: "音效",
    rowSoundDesc: "Clawd 完成任务或需要输入时播放提示音。",
    rowOpenAtLogin: "开机自启",
    rowOpenAtLoginDesc: "登录系统时自动启动 Clawd。",
    rowStartWithClaude: "随 Claude Code 启动",
    rowStartWithClaudeDesc: "Claude Code 会话开始时自动拉起 Clawd。",
    rowBubbleFollow: "气泡跟随 Clawd",
    rowBubbleFollowDesc: "把权限气泡和更新气泡放在桌宠旁边，而不是屏幕角落。",
    rowHideBubbles: "隐藏所有气泡",
    rowHideBubblesDesc: "完全屏蔽权限、通知和更新气泡。",
    rowShowSessionId: "显示会话 ID",
    rowShowSessionIdDesc: "在气泡标题和会话菜单后追加短会话 ID。",
    toastSaveFailed: "保存失败：",
    langEnglish: "English",
    langChinese: "中文",
    themeTabTitle: "主题",
    themeTabSubtitle: "选择陪你编程的桌宠角色。",
    themeBuiltin: "内置",
    aboutTabTitle: "关于 Clawd on Desk",
    aboutVersion: "版本",
    aboutDescription: "实时感知 AI 编程助手状态并播放动画的桌面宠物。",
    aboutRepo: "GitHub 仓库",
    aboutLicense: "许可证",
    aboutAgents: "支持的 Agent",
    animMapTitle: "动画映射",
    animMapSubtitle: "Agent 事件如何映射到桌宠动画。",
    animMapEvent: "事件",
    animMapState: "状态",
    animMapAnimation: "动画",
    shortcutsTitle: "键盘快捷键",
    shortcutsSubtitle: "当前快捷键绑定。自定义功能将在后续更新中推出。",
    shortcutsAction: "操作",
    shortcutsKey: "快捷键",
    shortcutAllow: "允许最新权限气泡",
    shortcutDeny: "拒绝最新权限气泡",
    shortcutNotCustomizable: "暂不支持自定义",
  },
};

let snapshot = null;
let activeTab = "general";
// Static per-agent metadata from agents/registry.js via settings:list-agents.
// Fetched once at boot (since it can't change while the app is running).
// Null until hydrated — renderAgentsTab() renders an empty placeholder.
let agentMetadata = null;

function t(key) {
  const lang = (snapshot && snapshot.lang) || "en";
  const dict = STRINGS[lang] || STRINGS.en;
  return dict[key] || key;
}

// ── Toast ──
const toastStack = document.getElementById("toastStack");
function showToast(message, { error = false, ttl = 3500 } = {}) {
  const node = document.createElement("div");
  node.className = "toast" + (error ? " error" : "");
  node.textContent = message;
  toastStack.appendChild(node);
  // Force reflow then add visible class so the transition runs.
  // eslint-disable-next-line no-unused-expressions
  node.offsetHeight;
  node.classList.add("visible");
  setTimeout(() => {
    node.classList.remove("visible");
    setTimeout(() => node.remove(), 240);
  }, ttl);
}

// ── Sidebar ──
const SIDEBAR_TABS = [
  { id: "general", icon: "\u2699", labelKey: "sidebarGeneral", available: true },
  { id: "agents", icon: "\u26A1", labelKey: "sidebarAgents", available: true },
  { id: "theme", icon: "\u{1F3A8}", labelKey: "sidebarTheme", available: true },
  { id: "animMap", icon: "\u{1F3AC}", labelKey: "sidebarAnimMap", available: true },
  { id: "shortcuts", icon: "\u2328", labelKey: "sidebarShortcuts", available: true },
  { id: "about", icon: "\u2139", labelKey: "sidebarAbout", available: true },
];

function renderSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.innerHTML = "";
  for (const tab of SIDEBAR_TABS) {
    const item = document.createElement("div");
    item.className = "sidebar-item";
    if (!tab.available) item.classList.add("disabled");
    if (tab.id === activeTab) item.classList.add("active");
    item.innerHTML =
      `<span class="sidebar-item-icon">${tab.icon}</span>` +
      `<span class="sidebar-item-label">${escapeHtml(t(tab.labelKey))}</span>` +
      (tab.available ? "" : `<span class="sidebar-item-soon">${escapeHtml(t("sidebarSoon"))}</span>`);
    if (tab.available) {
      item.addEventListener("click", () => {
        activeTab = tab.id;
        renderSidebar();
        renderContent();
      });
    }
    sidebar.appendChild(item);
  }
}

// ── Content ──
function renderThemeTab(container) {
  window.settingsAPI.listThemes().then((themes) => {
    const section = document.createElement("div");
    section.className = "settings-section";

    const title = document.createElement("h3");
    title.textContent = t("themeTabTitle");
    section.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "settings-subtitle";
    subtitle.textContent = t("themeTabSubtitle");
    section.appendChild(subtitle);

    const grid = document.createElement("div");
    grid.className = "theme-grid";

    const currentTheme = snapshot.theme || "clawd";

    for (const theme of themes) {
      const card = document.createElement("div");
      card.className = "theme-card" + (theme.id === currentTheme ? " active" : "");
      const previewHtml = theme.idleSvg
        ? `<img src="../assets/svg/${escapeHtml(theme.idleSvg)}" class="theme-card-preview" alt="" onerror="this.style.display='none'" />`
        : "";
      card.innerHTML =
        previewHtml +
        `<div class="theme-card-name">${escapeHtml(theme.name)}</div>` +
        `<div class="theme-card-id">${escapeHtml(theme.id)}</div>` +
        (theme.builtin ? `<span class="theme-card-badge">${escapeHtml(t("themeBuiltin"))}</span>` : "");
      card.addEventListener("click", () => {
        window.settingsAPI.update("theme", theme.id);
      });
      grid.appendChild(card);
    }

    section.appendChild(grid);
    container.appendChild(section);
  }).catch(() => {
    const error = document.createElement("p");
    error.className = "settings-error";
    error.textContent = "Failed to load themes.";
    container.appendChild(error);
  });
}

function renderAboutTab(container) {
  const section = document.createElement("div");
  section.className = "settings-section";

  const title = document.createElement("h3");
  title.textContent = t("aboutTabTitle");
  section.appendChild(title);

  const version = document.createElement("div");
  version.className = "about-row";
  version.innerHTML = `<span class="about-label">${escapeHtml(t("aboutVersion"))}</span>` +
    `<span class="about-value">0.5.10</span>`;
  section.appendChild(version);

  const desc = document.createElement("p");
  desc.className = "settings-subtitle";
  desc.textContent = t("aboutDescription");
  section.appendChild(desc);

  const links = document.createElement("div");
  links.className = "about-links";
  links.innerHTML =
    `<a href="https://github.com/cameleonh/clawd-on-desk" target="_blank">${escapeHtml(t("aboutRepo"))}</a>` +
    `<span class="about-separator">|</span>` +
    `<span>${escapeHtml(t("aboutLicense"))}: MIT</span>`;
  section.appendChild(links);

  const agentsTitle = document.createElement("h4");
  agentsTitle.textContent = t("aboutAgents");
  section.appendChild(agentsTitle);

  const agentsList = document.createElement("div");
  agentsList.className = "about-agents";
  const agents = [
    "Claude Code", "Codex CLI", "Copilot CLI", "Cursor Agent",
    "Gemini CLI", "Kiro CLI", "opencode"
  ];
  for (const name of agents) {
    const badge = document.createElement("span");
    badge.className = "about-agent-badge";
    badge.textContent = name;
    agentsList.appendChild(badge);
  }
  section.appendChild(agentsList);

  container.appendChild(section);
}

function renderAnimMapTab(container) {
  const section = document.createElement("div");
  section.className = "settings-section";

  const title = document.createElement("h3");
  title.textContent = t("animMapTitle");
  section.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "settings-subtitle";
  subtitle.textContent = t("animMapSubtitle");
  section.appendChild(subtitle);

  const map = [
    { event: "SessionStart", state: "idle", animation: "clawd-idle-follow.svg" },
    { event: "UserPromptSubmit", state: "thinking", animation: "clawd-working-thinking.svg" },
    { event: "PreToolUse / PostToolUse (1)", state: "working", animation: "clawd-working-typing.svg" },
    { event: "PreToolUse / PostToolUse (2)", state: "working", animation: "clawd-working-juggling.svg" },
    { event: "PreToolUse / PostToolUse (3+)", state: "working", animation: "clawd-working-building.svg" },
    { event: "SubagentStart (1)", state: "juggling", animation: "clawd-working-juggling.svg" },
    { event: "SubagentStart (2+)", state: "conducting", animation: "clawd-working-conducting.svg" },
    { event: "Stop", state: "attention", animation: "clawd-happy.svg" },
    { event: "PostToolUseFailure", state: "error", animation: "clawd-error.svg" },
    { event: "Notification", state: "notification", animation: "clawd-notification.svg" },
    { event: "PermissionRequest", state: "notification", animation: "clawd-notification.svg + bubble" },
    { event: "PreCompact", state: "sweeping", animation: "clawd-working-sweeping.svg" },
    { event: "WorktreeCreate", state: "carrying", animation: "clawd-working-carrying.svg" },
    { event: "60s idle", state: "sleeping", animation: "clawd-sleeping.svg" },
  ];

  const table = document.createElement("table");
  table.className = "anim-map-table";
  table.innerHTML =
    `<thead><tr>` +
    `<th>${escapeHtml(t("animMapEvent"))}</th>` +
    `<th>${escapeHtml(t("animMapState"))}</th>` +
    `<th>${escapeHtml(t("animMapAnimation"))}</th>` +
    `</tr></thead>`;

  const tbody = document.createElement("tbody");
  for (const row of map) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${escapeHtml(row.event)}</td>` +
      `<td><span class="anim-state-badge">${escapeHtml(row.state)}</span></td>` +
      `<td class="anim-file">${escapeHtml(row.animation)}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  section.appendChild(table);

  container.appendChild(section);
}

function renderShortcutsTab(container) {
  const section = document.createElement("div");
  section.className = "settings-section";

  const title = document.createElement("h3");
  title.textContent = t("shortcutsTitle");
  section.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "settings-subtitle";
  subtitle.textContent = t("shortcutsSubtitle");
  section.appendChild(subtitle);

  const shortcuts = [
    { action: t("shortcutAllow"), key: "Ctrl+Shift+Y" },
    { action: t("shortcutDeny"), key: "Ctrl+Shift+N" },
  ];

  const table = document.createElement("table");
  table.className = "shortcuts-table";
  table.innerHTML =
    `<thead><tr>` +
    `<th>${escapeHtml(t("shortcutsAction"))}</th>` +
    `<th>${escapeHtml(t("shortcutsKey"))}</th>` +
    `</tr></thead>`;

  const tbody = document.createElement("tbody");
  for (const s of shortcuts) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${escapeHtml(s.action)}</td>` +
      `<td><kbd>${escapeHtml(s.key)}</kbd></td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  section.appendChild(table);

  const note = document.createElement("p");
  note.className = "settings-note";
  note.textContent = t("shortcutNotCustomizable");
  section.appendChild(note);

  container.appendChild(section);
}

function renderContent() {
  const content = document.getElementById("content");
  content.innerHTML = "";
  if (activeTab === "general") {
    renderGeneralTab(content);
  } else if (activeTab === "agents") {
    renderAgentsTab(content);
  } else if (activeTab === "theme") {
    renderThemeTab(content);
  } else if (activeTab === "animMap") {
    renderAnimMapTab(content);
  } else if (activeTab === "shortcuts") {
    renderShortcutsTab(content);
  } else if (activeTab === "about") {
    renderAboutTab(content);
  }
}

function renderAgentsTab(parent) {
  const h1 = document.createElement("h1");
  h1.textContent = t("agentsTitle");
  parent.appendChild(h1);

  const subtitle = document.createElement("p");
  subtitle.className = "subtitle";
  subtitle.textContent = t("agentsSubtitle");
  parent.appendChild(subtitle);

  if (!agentMetadata || agentMetadata.length === 0) {
    const empty = document.createElement("div");
    empty.className = "placeholder";
    empty.innerHTML = `<div class="placeholder-desc">${escapeHtml(t("agentsEmpty"))}</div>`;
    parent.appendChild(empty);
    return;
  }

  const rows = agentMetadata.flatMap((agent) => buildAgentRows(agent));
  parent.appendChild(buildSection("", rows));
}

function buildAgentRows(agent) {
  const rows = [
    buildAgentSwitchRow({
      agent,
      flag: "enabled",
      extraClass: null,
      buildText: (text) => {
        const label = document.createElement("span");
        label.className = "row-label";
        label.textContent = agent.name || agent.id;
        text.appendChild(label);
        const badges = document.createElement("span");
        badges.className = "row-desc agent-badges";
        const esKey = agent.eventSource === "log-poll" ? "eventSourceLogPoll"
          : agent.eventSource === "plugin-event" ? "eventSourcePlugin"
          : "eventSourceHook";
        const esBadge = document.createElement("span");
        esBadge.className = "agent-badge";
        esBadge.textContent = t(esKey);
        badges.appendChild(esBadge);
        if (agent.capabilities && agent.capabilities.permissionApproval) {
          const permBadge = document.createElement("span");
          permBadge.className = "agent-badge accent";
          permBadge.textContent = t("badgePermissionBubble");
          badges.appendChild(permBadge);
        }
        text.appendChild(badges);
      },
    }),
  ];
  const caps = agent.capabilities || {};
  if (caps.permissionApproval || caps.interactiveBubble) {
    rows.push(buildAgentSwitchRow({
      agent,
      flag: "permissionsEnabled",
      extraClass: "row-sub",
      buildText: (text) => {
        const label = document.createElement("span");
        label.className = "row-label";
        label.textContent = t("rowAgentPermissions");
        text.appendChild(label);
        const desc = document.createElement("span");
        desc.className = "row-desc";
        desc.textContent = t("rowAgentPermissionsDesc");
        text.appendChild(desc);
      },
    }));
  }
  return rows;
}

function buildAgentSwitchRow({ agent, flag, extraClass, buildText }) {
  const row = document.createElement("div");
  row.className = extraClass ? `row ${extraClass}` : "row";

  const text = document.createElement("div");
  text.className = "row-text";
  buildText(text);
  row.appendChild(text);

  const ctrl = document.createElement("div");
  ctrl.className = "row-control";
  const sw = document.createElement("div");
  sw.className = "switch";
  sw.setAttribute("role", "switch");
  sw.setAttribute("tabindex", "0");
  const readFlag = () => {
    const entry = snapshot && snapshot.agents && snapshot.agents[agent.id];
    return entry ? entry[flag] !== false : true;
  };
  const on = readFlag();
  if (on) sw.classList.add("on");
  sw.setAttribute("aria-checked", on ? "true" : "false");
  attachSwitchToggle(sw, () =>
    window.settingsAPI.command("setAgentFlag", {
      agentId: agent.id,
      flag,
      value: !readFlag(),
    })
  );
  ctrl.appendChild(sw);
  row.appendChild(ctrl);
  return row;
}

function renderGeneralTab(parent) {
  const h1 = document.createElement("h1");
  h1.textContent = t("settingsTitle");
  parent.appendChild(h1);

  const subtitle = document.createElement("p");
  subtitle.className = "subtitle";
  subtitle.textContent = t("settingsSubtitle");
  parent.appendChild(subtitle);

  // Section: Appearance
  parent.appendChild(buildSection(t("sectionAppearance"), [
    buildLanguageRow(),
    buildSwitchRow({
      key: "soundMuted",
      labelKey: "rowSound",
      descKey: "rowSoundDesc",
      // soundMuted is inverse: ON-switch means sound enabled.
      invert: true,
    }),
  ]));

  // Section: Startup
  parent.appendChild(buildSection(t("sectionStartup"), [
    buildSwitchRow({
      key: "openAtLogin",
      labelKey: "rowOpenAtLogin",
      descKey: "rowOpenAtLoginDesc",
    }),
    buildSwitchRow({
      key: "autoStartWithClaude",
      labelKey: "rowStartWithClaude",
      descKey: "rowStartWithClaudeDesc",
    }),
  ]));

  // Section: Bubbles
  parent.appendChild(buildSection(t("sectionBubbles"), [
    buildSwitchRow({
      key: "bubbleFollowPet",
      labelKey: "rowBubbleFollow",
      descKey: "rowBubbleFollowDesc",
    }),
    buildSwitchRow({
      key: "hideBubbles",
      labelKey: "rowHideBubbles",
      descKey: "rowHideBubblesDesc",
    }),
    buildSwitchRow({
      key: "showSessionId",
      labelKey: "rowShowSessionId",
      descKey: "rowShowSessionIdDesc",
    }),
  ]));
}

function buildSection(title, rows) {
  const section = document.createElement("section");
  section.className = "section";
  if (title) {
    const heading = document.createElement("h2");
    heading.className = "section-title";
    heading.textContent = title;
    section.appendChild(heading);
  }
  const wrap = document.createElement("div");
  wrap.className = "section-rows";
  for (const row of rows) wrap.appendChild(row);
  section.appendChild(wrap);
  return section;
}

// Wire click + Space/Enter keydown on a `.switch` to an async invoker that
// returns a `Promise<{status, message?}>`. Handles pending state, error
// toasts, and keyboard activation identically across all rows — so
// `buildSwitchRow` (pure prefs) and `buildAgentRow` (command-backed) share
// a single toggle behavior.
function attachSwitchToggle(sw, invoke) {
  const run = () => {
    if (sw.classList.contains("pending")) return;
    sw.classList.add("pending");
    Promise.resolve()
      .then(invoke)
      .then((result) => {
        sw.classList.remove("pending");
        if (!result || result.status !== "ok") {
          const msg = (result && result.message) || "unknown error";
          showToast(t("toastSaveFailed") + msg, { error: true });
        }
      })
      .catch((err) => {
        sw.classList.remove("pending");
        showToast(t("toastSaveFailed") + (err && err.message), { error: true });
      });
  };
  sw.addEventListener("click", run);
  sw.addEventListener("keydown", (ev) => {
    if (ev.key === " " || ev.key === "Enter") {
      ev.preventDefault();
      run();
    }
  });
}

function buildSwitchRow({ key, labelKey, descKey, invert = false }) {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML =
    `<div class="row-text">` +
      `<span class="row-label"></span>` +
      `<span class="row-desc"></span>` +
    `</div>` +
    `<div class="row-control"><div class="switch" role="switch" tabindex="0"></div></div>`;
  row.querySelector(".row-label").textContent = t(labelKey);
  row.querySelector(".row-desc").textContent = t(descKey);
  const sw = row.querySelector(".switch");
  const rawValue = !!(snapshot && snapshot[key]);
  const visualOn = invert ? !rawValue : rawValue;
  if (visualOn) sw.classList.add("on");
  sw.setAttribute("aria-checked", visualOn ? "true" : "false");
  // No optimistic update — visual state flips on broadcast, not on click.
  // If the action fails, the broadcast never fires and the switch stays.
  attachSwitchToggle(sw, () => {
    const currentRaw = !!(snapshot && snapshot[key]);
    const currentVisual = invert ? !currentRaw : currentRaw;
    const nextRaw = invert ? currentVisual : !currentVisual;
    return window.settingsAPI.update(key, nextRaw);
  });
  return row;
}

function buildLanguageRow() {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML =
    `<div class="row-text">` +
      `<span class="row-label"></span>` +
      `<span class="row-desc"></span>` +
    `</div>` +
    `<div class="row-control">` +
      `<div class="segmented" role="tablist">` +
        `<button data-lang="en"></button>` +
        `<button data-lang="zh"></button>` +
      `</div>` +
    `</div>`;
  row.querySelector(".row-label").textContent = t("rowLanguage");
  row.querySelector(".row-desc").textContent = t("rowLanguageDesc");
  const buttons = row.querySelectorAll(".segmented button");
  buttons[0].textContent = t("langEnglish");
  buttons[1].textContent = t("langChinese");
  const current = (snapshot && snapshot.lang) || "en";
  for (const btn of buttons) {
    if (btn.dataset.lang === current) btn.classList.add("active");
    btn.addEventListener("click", () => {
      const next = btn.dataset.lang;
      if (next === ((snapshot && snapshot.lang) || "en")) return;
      window.settingsAPI.update("lang", next).then((result) => {
        if (!result || result.status !== "ok") {
          const msg = (result && result.message) || "unknown error";
          showToast(t("toastSaveFailed") + msg, { error: true });
        }
      }).catch((err) => {
        showToast(t("toastSaveFailed") + (err && err.message), { error: true });
      });
    });
  }
  return row;
}

// ── Boot ──
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

window.settingsAPI.onChanged((payload) => {
  if (payload && payload.snapshot) {
    snapshot = payload.snapshot;
  } else if (payload && payload.changes && snapshot) {
    snapshot = { ...snapshot, ...payload.changes };
  }
  // Guard against an early broadcast that lands before `getSnapshot()`
  // resolves — rendering with a null snapshot blanks the UI and the
  // initial render later would need to re-fetch static language state.
  if (!snapshot) return;
  renderSidebar();
  renderContent();
});

window.settingsAPI.getSnapshot().then((snap) => {
  snapshot = snap || {};
  renderSidebar();
  renderContent();
});

// Fetch static agent metadata once at boot. It's a pure lookup from
// agents/registry.js — no runtime state — so there's no refresh loop.
if (typeof window.settingsAPI.listAgents === "function") {
  window.settingsAPI
    .listAgents()
    .then((list) => {
      agentMetadata = Array.isArray(list) ? list : [];
      if (activeTab === "agents") renderContent();
    })
    .catch((err) => {
      console.warn("settings: listAgents failed", err);
      agentMetadata = [];
    });
}
