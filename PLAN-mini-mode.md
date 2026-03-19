# 极简模式（Mini Mode）实现方案

## 1. 功能概述

极简模式是 Clawd 的"最小化"形态。Clawd 吸附到**屏幕右边缘**，窗口一半推到屏幕外，屏幕边缘自然"遮住"另一半身体——视觉上只露出半身。

**仅支持右边缘**。角色面朝左（屏幕内侧），无需镜像，SVG 只需一套。

角色使用**完整身体**（基于 idle-follow 微调：身体倾斜 + 手臂拉长），不做裁切。
在此模式下保持：呼吸动画、眨眼、偶尔手臂晃动、眼球追踪。
关键事件以极简方式提示（感叹号 / 花花），鼠标悬停探出身体，点击恢复正常模式。

---

## 2. 交互设计

### 2.1 进入极简模式

**方式 1 — 拖拽到右边缘**：

拖拽到右边缘 clamp 极限时，Clawd 被"快速吸走"——窗口突然加速滑入边缘。

```
用户拖 Clawd 到右边缘 → 触碰 clamp 右极限
  → pointerup → renderer flush delta + 发送 drag-end
  → main.js checkMiniModeSnap()
  → 窗口快速滑入右边缘（~150ms）
  → 短暂停顿（~400ms）
  → 播放探头入场动画（clawd-mini-enter.svg）
  → 入场完毕 → 切换 mini-idle
```

> **Codex Review 修复**：仅 `didDrag === true` 时触发检测，独立 `drag-end` IPC。

**方式 2 — 右键菜单"极简模式"**：见 2.3 节。

### 2.2 极简模式行为

| 原始事件 | 极简反应 | 持续 |
|---------|---------|------|
| 默认 | 呼吸+眨眼+偶尔手臂晃+眼球追踪 | 持续 |
| Notification / PermissionRequest | 头顶弹出感叹号 | 4s 后消失 |
| Stop / PostCompact（attention） | 头顶冒出花花 | 4s 后消失 |
| 其他工作事件 | 无视觉反应（session 正常更新） | — |
| 睡眠序列 | 不触发（极简已是待命形态） | — |

**Peek 交互**：
- 鼠标进入角色 hit box → 窗口向屏幕内侧滑出 `PEEK_OFFSET`(25px) + 切换到 `clawd-mini-peek.svg`（招手）
- 鼠标离开 → 窗口滑回 + 切换回 `clawd-mini-idle.svg`
- Peek 期间角色 cursor 变为 `pointer`
- **动画期间冻结 hover 检测**（`isAnimating` 标志），防止抖动死循环

> **Codex Review 修复**：Peek 滑出 25px 后光标可能离开 hit box → 触发滑回 →
> 光标又进入 → 反复抖动。**修复**：`animateWindowX()` 必须是可取消的单所有者
> 动画（`peekAnimTimer`），动画开始时设 `isAnimating = true`，结束时才解锁
> hover 检测。取消旧动画再启动新动画，避免 `setBounds()` 竞争。

### 2.3 进入极简模式 — 右键菜单方式

```
用户右键 → 点击"极简模式"
  → 螃蟹步 →→→ 走到右边缘（clawd-mini-crabwalk.svg）
  → 抛物线跳入右边缘（消失）
  → 短暂停顿（~400ms）
  → 播放探头入场动画（clawd-mini-enter.svg）
  → 入场完毕 → 切换 mini-idle
```

### 2.4 探头入场动画（SVG 内部，一次性）

窗口已在 mini 位置（固定不动），角色入场完全由 SVG CSS keyframes 驱动：

```
Phase 1 (0-30%):   ←整体从右滑入一小段 + 弹跳1下（overshoot→回弹）
                    眼睛看向左边
Phase 2 (30-65%):  ←手臂从身体后伸出 + 弹跳1下 + 轻挥几下
Phase 3 (65-100%): 眼睛从看左 → 回到中间，正常眨眼，静止

→ 播放完毕（~3s），main.js 切换到 mini-idle（眼球追踪接管）
```

### 2.5 退出极简模式

**方式 1**：Peek 状态下点击角色
**方式 2**：右键菜单"退出极简模式"

**跳出动画**（抛物线跳入的反向）：
```
窗口从右边缘 → 抛物线弧线 → 落到 preMini 位置
x: 线性插值 → targetX
y: 抛物线 -4 × peakHeight × t × (t-1)
```

退出后通过 `setState()` 恢复（走 DND/sleep 检查路径）。

> **Codex Review 修复**：退出时走 `setState()` 而非 `applyState()`。

---

## 3. SVG 素材

### 3.1 核心思路

**不做裁切，用完整角色**。基于 `clawd-idle-follow.svg` 修改：
- 身体整体旋转 ~10-15°（向屏幕内侧倾斜，像趴在边缘探头看）
- 朝屏幕内侧的手臂适当拉长（增加探出感）
- 保留 `#eyes-js`、`#body-js` 结构，眼球追踪照常工作
- "半身"效果完全由窗口定位实现——窗口一半推到屏幕外，屏幕边缘自然遮住另一半
- Peek 时窗口向内滑出，露出更多角色，天然支持

仅支持右边缘，所有 SVG 面朝左，无需镜像。

### 3.2 素材清单

| 文件 | 基于 | 改动 |
|------|------|------|
| `clawd-mini-idle.svg` | `clawd-idle-follow.svg` | 旋转+手臂拉长+手臂晃动+`#eyes-js` |
| `clawd-mini-enter.svg` | `clawd-mini-idle.svg` | 一次性入场动画：探头弹跳→手伸出挥手→静止 |
| `clawd-mini-alert.svg` | `clawd-mini-idle.svg` | + 感叹号弹出 + `><` 挤眼 + 手臂摇更大 |
| `clawd-mini-happy.svg` | `clawd-mini-idle.svg` | + 花花散落 + `^^` 眯眼 |
| `clawd-mini-peek.svg` | `clawd-mini-idle.svg` | 手臂大幅招手动画（hover 时显示） |
| `clawd-mini-crabwalk.svg` | `clawd-working-debugger.svg` | 删除放大镜，保留螃蟹步（右键进入时播放） |

### 3.3 SVG 修改细节

**基于 idle-follow 的改动点**（颜色 `#DE886D` 不变）：

1. **身体旋转**：在 `#body-js` 内添加一层 `<g transform="rotate(-12, 7.5, 13)">`
   - 旋转中心 `(7.5, 13)` 是角色身体中心（同 breathe-anim 的 transform-origin）
   - 负角度 = 向左倾斜（面朝屏幕内侧）

2. **手臂拉长**：屏幕内侧的手臂（旋转后为右臂）rect 高度从 2→3 或 4，
   呈伸出姿态

3. **手臂晃动**：新增 CSS 动画 `arm-wobble`（8s 周期，偶尔小幅旋转）

4. **无影子**：删除 `#shadow-js`（贴边没有地面）

5. **保留的结构**：
   - `#eyes-js` — 眼球追踪（两只眼都保留，屏幕外的自然不可见）
   - `#body-js` — JS 身体偏移（mini 模式下不使用，但保留兼容性）
   - `.breathe-anim` — 呼吸动画（同 idle-follow 的 3.2s 循环）
   - `.eyes-blink` — 眨眼动画（同 idle-follow 的 4s 循环）

### 3.4 眼睛表情

**`><` 挤眼**（mini-alert）— 提取自 `clawd-react-drag.svg`：
```xml
<g fill="none" stroke="#000000" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="4,8 5.5,9 4,10"/>   <!-- 左眼 > -->
  <polyline points="11,8 9.5,9 11,10"/>  <!-- 右眼 < -->
</g>
```
替换原有的 `#eyes-js` 中的 rect 眼睛。

**`^^` 眯眼**（mini-happy）— 两个倒 V：
```xml
<g fill="none" stroke="#000000" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="3.5,9 4.5,8 5.5,9"/>  <!-- 左眼 ^ -->
  <polyline points="9.5,9 10.5,8 11.5,9"/> <!-- 右眼 ^ -->
</g>
```

### 3.5 感叹号和花花

**感叹号**（mini-alert）— 从 notification SVG 提取 `.alert-pop`：
```xml
<g class="alert-pop" fill="#FF3D00">
  <rect x="11" y="-2" width="2" height="4"/>
  <rect x="11" y="3" width="2" height="2"/>
</g>
```
动画：scale(0.5) → scale(1.2) 弹出。手臂摇动幅度比 mini-idle 的 arm-wobble 更大。

**花花/星星**（mini-happy）— 复用 happy SVG 的 `#px-sparkle` 定义 + 动画：
```xml
<use href="#px-sparkle" x="12" y="-4" fill="#FFD700" style="--delay: 0s"/>
<use href="#px-sparkle" x="18" y="2"  fill="#FFA000" style="--delay: 0.4s"/>
<use href="#px-sparkle" x="10" y="-8" fill="#FFF59D" style="--delay: 0.8s"/>
```

### 3.6 入场动画（clawd-mini-enter.svg）

一次性 SVG 动画（`animation-iteration-count: 1; animation-fill-mode: forwards`），约 3s。
窗口在 mini 位置固定不动，角色入场完全由 CSS keyframes 驱动。

```css
/* 整体入场：从右侧滑入 + 弹跳 */
@keyframes enter-slide {
  0%       { transform: translate(15px, 0); }
  20%      { transform: translate(-1.5px, 0); }  /* overshoot */
  28%      { transform: translate(0, 0); }        /* 弹回 */
  100%     { transform: translate(0, 0); }
}

/* 眼睛：先看左，后回中 */
@keyframes enter-eyes {
  0%, 30%  { transform: translate(-2px, 0); }  /* 看左 */
  70%      { transform: translate(0, 0); }      /* 回中 */
  100%     { transform: translate(0, 0); }
}

/* 手臂：延迟伸出 + 弹跳 + 挥手 */
@keyframes enter-arm {
  0%, 25%  { transform: translate(3px, 0) rotate(0deg); }     /* 藏在身体后 */
  35%      { transform: translate(-1px, 0) rotate(-10deg); }   /* 伸出 overshoot */
  40%      { transform: translate(0, 0) rotate(0deg); }        /* 弹回 */
  50%      { transform: rotate(15deg); }                       /* 挥手 */
  55%      { transform: rotate(-5deg); }
  60%      { transform: rotate(12deg); }
  65%, 100% { transform: rotate(0deg); }                       /* 静止 */
}
```

播放完毕后 main.js 通过 `setTimeout(3000)` 切换到 `mini-idle`。

### 3.7 螃蟹步（右键进入用）

`clawd-mini-crabwalk.svg` — 基于 `clawd-working-debugger.svg`：
- **保留**：`.body-hunch`（左右晃动）、`.leg-1`/`.leg-2`（踮脚走）、影子
- **删除**：整个 `.magnifying-glass` 组（放大镜+右手）
- **添加**：右臂恢复为普通姿势（同 idle-follow 的 `x=13 y=9 w=2 h=2`）
- **眼睛**：两眼正常大小（debugger 原版左眼是 squinting 的，改回正常）

---

## 4. 窗口管理

### 4.1 窗口定位

角色身体中心在 viewBox x≈7.5。将身体中心对齐屏幕边缘，让约一半身体在屏幕外。

考虑 CSS 对象尺寸（190%×130%，left:-45%，xMidYMid meet）：
```
角色中心的屏幕 x = windowX + windowWidth × 0.486
```

定义常量 `MINI_OFFSET_RATIO = 0.486`（约 48.6% 窗口宽度在屏外）：

```javascript
// 右边缘（唯一支持的边缘）
const miniX = workArea.x + workArea.width - Math.round(windowWidth * (1 - MINI_OFFSET_RATIO));
```

> ⚠️ 此比例需根据最终 SVG 内容的实际位置微调。

### 4.2 Peek 滑出

```
右边缘：
默认     [■■■|====]
Peek     [■■■■■|==]
         ← 左移 25px →
```

```javascript
const PEEK_OFFSET = 25; // px

function miniPeekIn() {
  animateWindowX(currentMiniX - PEEK_OFFSET, 200);
}

function miniPeekOut() {
  animateWindowX(currentMiniX, 200);
}
```

### 4.3 窗口滑动动画

```javascript
let peekAnimTimer = null;
let isAnimating = false;

function animateWindowX(targetX, durationMs) {
  // 取消旧动画，防止 setBounds 竞争
  if (peekAnimTimer) { clearTimeout(peekAnimTimer); peekAnimTimer = null; }
  const bounds = win.getBounds();
  const startX = bounds.x;
  if (startX === targetX) { isAnimating = false; return; }
  isAnimating = true;
  const startTime = Date.now();
  const step = () => {
    const t = Math.min(1, (Date.now() - startTime) / durationMs);
    const eased = t * (2 - t); // ease-out quad
    const x = Math.round(startX + (targetX - startX) * eased);
    const b = win.getBounds();
    win.setBounds({ x, y: b.y, width: b.width, height: b.height });
    if (t < 1) {
      peekAnimTimer = setTimeout(step, 16);
    } else {
      peekAnimTimer = null;
      isAnimating = false; // 解锁 hover 检测
    }
  };
  step();
}
```

> **Codex Review 修复**：原版无法取消，多个动画会竞争 `setBounds()`。
> 新版用 `peekAnimTimer` 追踪当前动画，启动前取消旧动画。
> `isAnimating` 标志在 `startMainTick()` 中冻结 hover 切换。

### 4.4 抛物线跳跃动画

跳入边缘和跳出边缘使用同一个函数，交换 start/end 即可（抛物线对称）。

```javascript
function animateWindowParabola(targetX, targetY, durationMs, onDone) {
  if (peekAnimTimer) { clearTimeout(peekAnimTimer); peekAnimTimer = null; }
  const bounds = win.getBounds();
  const startX = bounds.x, startY = bounds.y;
  if (startX === targetX && startY === targetY) {
    isAnimating = false;
    if (onDone) onDone();
    return;
  }
  isAnimating = true;
  const startTime = Date.now();
  const step = () => {
    const t = Math.min(1, (Date.now() - startTime) / durationMs);
    const eased = t * (2 - t); // ease-out quad for x
    const x = Math.round(startX + (targetX - startX) * eased);
    // 抛物线 y：t=0 和 t=1 时偏移为 0，t=0.5 时到达最高点
    const arc = -4 * JUMP_PEAK_HEIGHT * t * (t - 1);
    const y = Math.round(startY + (targetY - startY) * eased - arc);
    const b = win.getBounds();
    win.setBounds({ x, y, width: b.width, height: b.height });
    if (t < 1) {
      peekAnimTimer = setTimeout(step, 16);
    } else {
      peekAnimTimer = null;
      isAnimating = false;
      if (onDone) onDone();
    }
  };
  step();
}
```

### 4.5 右键菜单进入 — 螃蟹步 + 跳入

```javascript
function enterMiniViaMenu() {
  const bounds = win.getBounds();
  const size = SIZES[currentSize];
  const wa = getNearestWorkArea(bounds.x + size.width / 2, bounds.y + size.height / 2);

  // ★ 先保存返回位置（走完螃蟹步后 bounds 已经变了）
  preMiniX = bounds.x;
  preMiniY = bounds.y;

  // ★ 进入过渡期，屏蔽 hook 事件和 peek
  miniTransitioning = true;

  // 切换螃蟹步 SVG → 向右走
  applyState("mini-crabwalk");

  // 水平移动到右边缘
  const edgeX = wa.x + wa.width - size.width + Math.round(size.width * 0.25);
  const walkDist = Math.abs(bounds.x - edgeX);
  const walkDuration = walkDist / CRABWALK_SPEED;
  animateWindowX(edgeX, walkDuration);

  // 走到边缘后跳入（用 miniTransitionTimer 追踪，可取消）
  miniTransitionTimer = setTimeout(() => {
    enterMiniMode(wa, true); // viaMenu = true，不重复保存 preMini
  }, walkDuration + 50);
}

// ★ 取消过渡（exitMiniMode 或异常中断时调用）
function cancelMiniTransition() {
  miniTransitioning = false;
  if (miniTransitionTimer) { clearTimeout(miniTransitionTimer); miniTransitionTimer = null; }
}

---

## 5. 代码变更

### 5.1 main.js

#### 新增常量和状态

```javascript
// Mini mode
const MINI_OFFSET_RATIO = 0.486;
const PEEK_OFFSET = 25;
const SNAP_TOLERANCE = 3; // px
const JUMP_PEAK_HEIGHT = 40; // 抛物线跳跃高度 (px)
const JUMP_DURATION = 350;   // 跳跃动画时长 (ms)
const CRABWALK_SPEED = 0.4;  // 螃蟹步速度 (px/ms)

let miniMode = false;
let miniTransitioning = false; // 过渡期保护（螃蟹步/入场动画期间）
let miniPeeking = false;
let preMiniX = 0, preMiniY = 0;
let currentMiniX = 0;      // 记录 mini 默认 x 位置（peek 返回用）
let miniTransitionTimer = null; // 统一追踪过渡期定时器

// 新增 STATE_SVGS
STATE_SVGS["mini-idle"]  = ["clawd-mini-idle.svg"];
STATE_SVGS["mini-alert"] = ["clawd-mini-alert.svg"];
STATE_SVGS["mini-happy"] = ["clawd-mini-happy.svg"];
STATE_SVGS["mini-enter"] = ["clawd-mini-enter.svg"];
STATE_SVGS["mini-peek"]  = ["clawd-mini-peek.svg"];
STATE_SVGS["mini-crabwalk"] = ["clawd-mini-crabwalk.svg"];

// 不需要新 HIT_BOXES — 用 default，屏幕边缘自然裁剪不可见部分

// 新增 auto-return
AUTO_RETURN_MS["mini-alert"] = 4000;
AUTO_RETURN_MS["mini-happy"] = 4000;
```

#### 新增函数

**`checkMiniModeSnap()`** — 拖拽结束时调用：
```javascript
function checkMiniModeSnap() {
  const bounds = win.getBounds();
  const size = SIZES[currentSize];
  const wa = getNearestWorkArea(bounds.x + size.width / 2, bounds.y + size.height / 2);
  const mRight = Math.round(size.width * 0.25);
  const rightLimit = wa.x + wa.width - size.width + mRight;

  if (bounds.x >= rightLimit - SNAP_TOLERANCE) {
    enterMiniMode(wa);
  }
}
```

**`enterMiniMode(workArea, viaMenu)`**：
```javascript
function enterMiniMode(wa, viaMenu) {
  const bounds = win.getBounds();
  // ★ viaMenu 时 preMini 已在 enterMiniViaMenu 中保存，不覆盖
  if (!viaMenu) {
    preMiniX = bounds.x;
    preMiniY = bounds.y;
  }
  miniMode = true;
  miniPeeking = false;

  // 计算右边缘目标位置
  const size = SIZES[currentSize];
  currentMiniX = wa.x + wa.width - Math.round(size.width * (1 - MINI_OFFSET_RATIO));

  // 取消所有状态定时器
  if (autoReturnTimer) { clearTimeout(autoReturnTimer); autoReturnTimer = null; }
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; pendingState = null; }
  stopWakePoll();

  // 通知 renderer
  sendToRenderer("mini-mode-change", true);

  // ★ 过渡期保护（拖拽进入也需要）
  miniTransitioning = true;
  buildContextMenu(); // ★ 刷新菜单

  if (viaMenu) {
    // 右键进入：已在边缘，抛物线跳入 → 停顿 → 探头入场
    animateWindowParabola(currentMiniX, bounds.y, JUMP_DURATION, () => {
      miniTransitionTimer = setTimeout(() => {
        applyState("mini-enter");
        // ★ 入场完毕后结束过渡期 + 切换 idle
        // 用 renderer IPC 回调同步（见 5.2），而非硬编码 3s
        miniTransitionTimer = setTimeout(() => {
          miniTransitioning = false;
          applyState("mini-idle");
        }, 3200); // 略长于 SVG 动画，留 200ms 余量
      }, 400);
    });
  } else {
    // 拖拽进入：快速滑入 → 停顿 → 探头入场
    animateWindowX(currentMiniX, 150);
    miniTransitionTimer = setTimeout(() => {
      applyState("mini-enter");
      miniTransitionTimer = setTimeout(() => {
        miniTransitioning = false;
        applyState("mini-idle");
      }, 3200);
    }, 550);
  }
}
```

**`exitMiniMode()`**：
```javascript
function exitMiniMode() {
  cancelMiniTransition(); // ★ 取消任何进行中的过渡
  miniMode = false;
  miniPeeking = false;
  sendToRenderer("mini-mode-change", false);
  buildContextMenu(); // ★ 刷新菜单

  // 恢复位置（验证 preMini 位置仍在屏幕内）
  const size = SIZES[currentSize];
  const clamped = clampToScreen(preMiniX, preMiniY, size.width, size.height);
  // 如果 clamped 位置太靠近边缘（会再次触发 snap），往内移 100px
  const wa = getNearestWorkArea(clamped.x + size.width / 2, clamped.y + size.height / 2);
  const mLeft = Math.round(size.width * 0.25);
  const mRight = Math.round(size.width * 0.25);
  if (clamped.x <= wa.x - mLeft + SNAP_TOLERANCE) clamped.x = wa.x - mLeft + 100;
  if (clamped.x >= wa.x + wa.width - size.width + mRight - SNAP_TOLERANCE) {
    clamped.x = wa.x + wa.width - size.width + mRight - 100;
  }

  // 抛物线跳出（跳入动画的反向）
  animateWindowParabola(clamped.x, clamped.y, JUMP_DURATION, () => {
    // 跳跃完成后恢复状态
    if (doNotDisturb) {
      applyState("sleeping");
    } else {
      const resolved = resolveDisplayState();
      setState(resolved, getSvgOverride(resolved));
    }
  });
}
```

#### 修改 `startMainTick()`

```javascript
// 在 hit-test 部分：
if (miniMode && !miniTransitioning) {
  // ★ peek 只在 mini-idle 或 mini-peek 时允许（不踩 alert/happy/enter）
  const canPeek = currentState === "mini-idle" || currentState === "mini-peek";

  if (!isAnimating && canPeek) {
    if (over && !miniPeeking) {
      miniPeeking = true;
      miniPeekIn();
      sendToRenderer("state-change", "mini-peek", "clawd-mini-peek.svg");
    } else if (!over && miniPeeking) {
      miniPeeking = false;
      miniPeekOut();
      sendToRenderer("state-change", "mini-idle", "clawd-mini-idle.svg");
    }
  }
}

// 在 eye tracking 部分：
// ★ mini-idle 的眼球追踪独立于正常 idle 的 idle-look/sleep 逻辑
// 正常 idle：眼球追踪 + 20s idle-look + 60s yawn（原有逻辑不变）
// mini-idle：仅眼球追踪，不进入 idle-look/sleep 序列
const idleNow = currentState === "idle" && !idlePaused;
const miniIdleNow = currentState === "mini-idle" && !idlePaused && !miniTransitioning;

// 正常 idle 走原有的 idle-look/sleep 逻辑（不变）
// mini-idle 只走眼球追踪部分：
if (miniIdleNow) {
  // 复用 idle-follow 的眼球锚点计算 dx/dy
  // 跳过 idle-look / yawn / sleep 逻辑
  // ... 眼球计算 + sendToRenderer("eye-move", dx, dy) ...
  return; // ★ 不进入后面的 idle-look/sleep 代码
}
```

> **Codex v2 修复**：
> 1. peek 只在 `mini-idle`/`mini-peek` 状态时允许，不踩 alert/happy/enter
> 2. 过渡期（`miniTransitioning`）时禁用 peek
> 3. mini-idle 眼球追踪独立于 idle-look/sleep 序列（用 `miniIdleNow` + early return）

#### 修改 `applyState()`

```javascript
function applyState(state, svgOverride) {
  // ★ 过渡期保护：只允许 mini-* 状态通过（螃蟹步/入场动画不被 hook 打断）
  if (miniTransitioning && !state.startsWith("mini-")) {
    return;
  }

  // 极简模式拦截
  if (miniMode && !state.startsWith("mini-")) {
    if (state === "notification") return applyState("mini-alert");
    if (state === "attention") return applyState("mini-happy");
    // 其他状态（working/thinking/error 等）：静默，不改变 mini 显示
    return;
  }

  // mini-alert/mini-happy 的 auto-return 目标改为 mini-idle
  // ... (在 auto-return 逻辑中判断)
  if (AUTO_RETURN_MS[state]) {
    autoReturnTimer = setTimeout(() => {
      autoReturnTimer = null;
      if (miniMode) {
        // ★ auto-return 后重新评估 hover：如果鼠标还在角色上，切 peek 而非 idle
        if (mouseOverPet) {
          miniPeeking = true;
          applyState("mini-peek");
        } else {
          applyState("mini-idle");
        }
      } else {
        const resolved = resolveDisplayState();
        applyState(resolved, getSvgOverride(resolved));
      }
    }, AUTO_RETURN_MS[state]);
  }

  // 原有逻辑...
}
```

#### 修改 `drag-lock` handler + 新增 `drag-end` handler

```javascript
// drag-lock 保持不变（用于 hit-test 冻结）
ipcMain.on("drag-lock", (event, locked) => {
  dragLocked = !!locked;
  if (locked && !mouseOverPet) {
    mouseOverPet = true;
    win.setIgnoreMouseEvents(false);
  }
});

// 新增：仅在真正拖拽结束时触发边缘检测
ipcMain.on("drag-end", () => {
  if (!miniMode) {
    checkMiniModeSnap();
  }
});
```

> **Codex Review 修复**：边缘检测从 `drag-lock(false)` 移到独立的 `drag-end` IPC，
> 仅在 renderer 确认 `didDrag === true` 且 pending delta 已 flush 后才发送。

#### 新增 IPC handler

```javascript
ipcMain.on("exit-mini-mode", () => {
  if (miniMode) exitMiniMode();
});
```

#### 修改 `savePrefs()` / `loadPrefs()`

```javascript
// savePrefs 新增字段
const data = {
  x, y, size: currentSize,
  miniMode, preMiniX, preMiniY,
};

// loadPrefs + createWindow：如果 prefs.miniMode，启动时恢复极简模式
// 需完整恢复：currentMiniX, miniPeeking=false
// did-finish-load 中重发 mini-mode-change(true) 给 renderer
```

> **Codex Review 修复**：启动恢复和 renderer 崩溃恢复(`did-finish-load`)
> 都需要完整重建 mini 状态：`currentMiniX` 重新计算,
> `miniPeeking = false`, 重发 `mini-mode-change` IPC。
> 否则窗口在屏幕边缘但 hit-test/renderer 以为是正常模式。

#### 修改 `clampToScreen` 调用

```javascript
ipcMain.on("move-window-by", (event, dx, dy) => {
  if (miniMode) return; // 极简模式禁止拖拽移动
  // ... 原有逻辑
});
```

#### 修改 `resizeWindow()`

```javascript
function resizeWindow(sizeKey) {
  currentSize = sizeKey;
  const size = SIZES[sizeKey];
  if (miniMode) {
    // 重新计算极简位置
    const wa = getNearestWorkArea(/* ... */);
    currentMiniX = wa.x + wa.width - Math.round(size.width * (1 - MINI_OFFSET_RATIO));
    win.setBounds({ x: currentMiniX, y: win.getBounds().y, width: size.width, height: size.height });
  } else {
    // 原有逻辑
  }
  buildContextMenu();
  savePrefs();
}
```

#### 修改 `buildContextMenu()`

- 正常模式：增加"极简模式"菜单项 → 调用 `enterMiniViaMenu()`
- 极简模式：增加"退出极简模式"菜单项 → 调用 `exitMiniMode()`

#### 抽取 `getNearestWorkArea(cx, cy)` 辅助函数

从 `clampToScreen` 中抽取"查找最近显示器工作区"的逻辑，供 `checkMiniModeSnap` 和 `getMiniPosition` 复用。

### 5.2 renderer.js

```javascript
// 新增状态
let miniMode = false;

// 新增 IPC 监听
window.electronAPI.onMiniModeChange((enabled) => {
  miniMode = enabled;
  // 极简模式下 cursor 改为 default（不显示 grab）
  // 无需 scaleX(-1)：仅支持右边缘，SVG 本身面朝左
  container.style.cursor = enabled ? "default" : "grab";
});

// 修改 click 处理（handleClick 函数内）
if (miniMode) {
  window.electronAPI.exitMiniMode();
  return;
}

// 修改 drag 处理（pointerdown 中）
if (miniMode) {
  // 极简模式下不启动拖拽，等 pointerup 触发 click
  return;
}

// 修改 stopDrag() — 真正拖拽结束时 flush delta 并发送 drag-end
function stopDrag() {
  if (!isDragging) return;
  isDragging = false;
  window.electronAPI.dragLock(false);
  container.classList.remove("dragging");
  // flush 最后一个 pending delta
  if (pendingDx !== 0 || pendingDy !== 0) {
    if (dragRAF) { cancelAnimationFrame(dragRAF); dragRAF = null; }
    window.electronAPI.moveWindowBy(pendingDx, pendingDy);
    pendingDx = 0; pendingDy = 0;
  }
  // 仅在真正拖拽过（非点击）时通知 main 检测边缘吸附
  if (didDrag) {
    window.electronAPI.dragEnd();
  }
  endDragReaction();
}

// SVG swap（onStateChange）中：
// 所有 mini SVG 都包含完整角色和 #eyes-js → attachEyeTracking
if (svg === "clawd-idle-follow.svg" || svg.startsWith("clawd-mini-")) {
  attachEyeTracking(next);
} else {
  detachEyeTracking();
}
```

### 5.3 preload.js

```javascript
// 新增 3 个 API
onMiniModeChange: (cb) =>
  ipcRenderer.on("mini-mode-change", (_, enabled) => cb(enabled)),
exitMiniMode: () => ipcRenderer.send("exit-mini-mode"),
dragEnd: () => ipcRenderer.send("drag-end"),
```

---

## 6. 状态机集成

### 6.1 事件流

```
hook 事件
  → updateSession()（正常更新 session map）
  → resolveDisplayState()
  → setState()
  → applyState()
      → if (miniMode)
          notification → "mini-alert"
          attention → "mini-happy"
          其他 → 忽略视觉更新
      → else
          正常处理
```

### 6.2 与现有系统的交互

| 系统 | 极简模式下 |
|-----|-----------|
| 睡眠序列 | 不触发（idle tick 中 miniMode 时跳过） |
| DND 模式 | 显示 mini-idle，不响应事件 |
| 多会话追踪 | session map 正常更新 |
| 单次性状态 auto-return | mini-alert/mini-happy → mini-idle |
| 位置记忆 | 保存 miniMode + preMini 位置 |
| 尺寸切换 | 重新计算 mini 窗口位置 |
| moveTop() 刷新 | 正常工作 |
| Renderer 崩溃恢复 | 重发 mini-mode-change(true)，main.js 保留 miniMode |

---

## 7. 边界情况

1. **多显示器**：吸附到触发时最近的显示器边缘。`getNearestWorkArea()` 复用。
2. **显示器断开**：`display-removed` 中，如果极简模式的工作区消失 → 自动 `exitMiniMode()`。
3. **显示器参数变化**：`display-metrics-changed` 中，极简模式下重新计算 `currentMiniX` 并更新窗口位置（不能让 generic clamp 把半隐藏窗口拉回来）。
4. **应用重启**：prefs 持久化极简模式。重启后完整恢复（`currentMiniX`、`miniPeeking=false`）。
5. **Renderer 崩溃**：`render-process-gone` 中重置 renderer 状态，`did-finish-load` 后重发 `mini-mode-change(true)` + `state-change("mini-idle", svg)`。
6. **DND + 极简**：显示 mini-idle 静态呼吸，不响应 hook 事件。
7. **极简模式下右键**：弹出菜单，包含"退出极简模式"选项。
8. **Peek 动画中鼠标快速进出**：`isAnimating` 标志冻结 hover 检测，动画完成后才重新评估。`peekAnimTimer` 确保旧动画被取消。
9. **尺寸切换**：重新计算 `currentMiniX`，更新窗口位置。
10. **corner 同时触发左右**：不可能（clamp 只会锁定一侧）。
11. **边缘附近普通点击误触发**：`drag-end` IPC 仅在 `didDrag === true` 时发送，点击不会触发。

---

## 8. 实施步骤

### Phase 1：SVG 素材（基于现有 SVG 修改，难度低）
1. 复制 `clawd-idle-follow.svg` → `clawd-mini-idle.svg`，修改：旋转 ~12°、手臂拉长、删影子、加 arm-wobble
2. 复制 mini-idle → `clawd-mini-enter.svg`，添加一次性入场动画（探头弹跳→手伸出挥手→静止）
3. 复制 mini-idle → `clawd-mini-alert.svg`，加感叹号 + `><` 挤眼 + 手臂摇更大
4. 复制 mini-idle → `clawd-mini-happy.svg`，加花花 + `^^` 眯眼
5. 复制 mini-idle → `clawd-mini-peek.svg`，手臂改为大幅招手动画
6. 复制 `clawd-working-debugger.svg` → `clawd-mini-crabwalk.svg`，删放大镜、恢复右臂和眼睛

### Phase 2：核心主进程逻辑
5. 抽取 `getNearestWorkArea()` 辅助函数
6. 添加 mini 状态变量、常量、STATE_SVGS
7. 实现 `checkMiniModeSnap()` + `enterMiniMode()` + `exitMiniMode()`
8. 实现 `animateWindowX()` + `animateWindowParabola()`
8b. 实现 `enterMiniViaMenu()`（螃蟹步 + 跳入）
9. 修改 `applyState()` 支持 mini 拦截
10. 修改 `startMainTick()` — `isAnimating` hover 冻结（仅右边缘，无镜像/dx取反）
11. 新增 `drag-end` IPC handler（替代 `drag-lock` 检测）
12. 修改 `display-metrics-changed` / `display-removed` 处理

### Phase 3：渲染和 IPC
13. `preload.js`：添加 `onMiniModeChange` + `exitMiniMode` + `dragEnd`
14. `renderer.js`：处理 `mini-mode-change`（cursor、click 退出、drag 禁用）
15. `renderer.js`：修改 `stopDrag()` — flush delta + 发送 `drag-end`

### Phase 4：集成和打磨
16. `savePrefs` / `loadPrefs` 持久化（含 mini 状态恢复）
17. `did-finish-load` 中恢复 mini 状态（重发 IPC）
18. 右键菜单"退出极简模式"
19. 边界情况处理（display-removed、display-metrics-changed、renderer 崩溃恢复）
20. 微调 `MINI_OFFSET_RATIO` 和 `PEEK_OFFSET`（视觉测试）

---

## 9. 风险与难点

| 风险 | 等级 | 应对 |
|------|------|------|
| SVG 修改（旋转+手臂） | 🟡 中 | 基于 idle-follow 改动，不再从头画，但旋转角度和手臂比例需视觉调试 |
| 窗口偏移量精调 | 🟡 中 | MINI_OFFSET_RATIO 用精确值 0.486，仍需视觉微调 |
| ~~CSS scaleX(-1) 镜像~~ | ✅ 已删除 | 仅支持右边缘，无需镜像 |
| ~~Peek 抖动~~ | ✅ 已解决 | `isAnimating` 标志 + 可取消 `peekAnimTimer` |
| ~~边缘误触发~~ | ✅ 已解决 | `drag-end` IPC 仅 `didDrag===true` + delta flush |
| ~~exitMiniMode 绕过 DND~~ | ✅ 已解决 | 退出走 `setState()` + DND 分支 |
| ~~眼球追踪进不去~~ | ✅ 已解决 | idle 条件扩展 + mini 眼球锚点常量 |
| 与现有状态机交互 | 🟢 低 | miniMode 顶层拦截，隔离干净 |

---

## 10. Codex Review 审计日志

**审查工具**：OpenAI Codex (gpt-5.4) — 2026-03-19
**审查范围**：完整方案 + 6 个源文件 + 3 个 SVG 素材

### 发现与修复

| # | 等级 | 问题 | 修复 |
|---|------|------|------|
| 1 | BLOCKER | 边缘吸附误触发：`drag-lock(false)` 每次 pointerup 都触发，点击也算 | 改用独立 `drag-end` IPC，仅 `didDrag===true` 且 delta flush 后发送 |
| 2 | BLOCKER | `exitMiniMode()` 绕过 DND/sleep：直接 `applyState()` 不走 DND 拦截 | 退出走 `setState()` + DND 分支判断 |
| 3 | BLOCKER | Peek 抖动死循环：滑出→光标离开→滑回→光标进入→重复 | `isAnimating` 标志冻结 hover + 可取消 `peekAnimTimer` |
| 4 | BLOCKER | 眼球追踪进不去：`currentState==="idle"` 不匹配 `"mini-idle"` | idle 条件扩展（眼球锚点复用 idle-follow，完整角色无需独立常量） |
| 5 | CONCERN | MINI_OFFSET_RATIO 精度：考虑 xMidYMid meet 后是 0.4856 非 0.48 | 修正为 0.486 |
| 6 | ~~CONCERN~~ | ~~Hit box 镜像~~ | 仅右边缘后无需镜像，已删除 |
| 7 | CONCERN | 重启恢复不完整：缺 currentMiniX 等 | 补全恢复逻辑 |
| 8 | CONCERN | display-metrics-changed 也需 mini 处理 | 加入边界情况列表 |

### Codex v2 审查（2026-03-19，仅右边缘简化版）

| # | 等级 | 问题 | 修复 |
|---|------|------|------|
| 9 | BLOCKER | 右键进入丢失返回位置：preMini 在 enterMiniMode 里保存，此时窗口已在边缘 | enterMiniViaMenu 开头先保存 preMiniX/Y |
| 10 | BLOCKER | 过渡状态无保护：螃蟹步/入场期间 hook 事件打断序列 | `miniTransitioning` 标志 + `miniTransitionTimer` 可取消 |
| 11 | BLOCKER | mini-idle 触发 idle-look/sleep 序列：扩展 idleNow 后 20s 切 idle-look、60s 打哈欠 | 分离 `miniIdleNow`，仅走眼球追踪 + early return |
| 12 | BLOCKER | Peek 踩 alert/happy：hover 直接切 peek 不管当前 mini 子状态 | peek 限制为 mini-idle/mini-peek 时才允许 |
| 13 | BLOCKER | 右键菜单未刷新：进入/退出后菜单还是旧的 | enterMiniMode/exitMiniMode 里调 buildContextMenu() |
| 14 | CONCERN | animateWindowParabola 无短路：start===target 时原地跳 | 加 early return |
| 15 | CONCERN | enter SVG 时序不同步：setTimeout(3000) 不等 SVG load | 留 200ms 余量（3200ms），后续可改 IPC 同步 |
| 16 | NICE-TO-HAVE | 文案残留 side/flip 引用 | 已清理 |
