#!/usr/bin/env bun
/**
 * 键盘可达与焦点可见的浏览器复验（零依赖）。
 *
 * 用法：
 *   bun run e2e:keyboard                                    全部四十课 + 两节深路径课
 *   CSP_E2E_KEYBOARD_LESSONS=s1-02,s3-01 bun tests/e2e/keyboard-cdp.ts
 *   CSP_E2E_KEYBOARD_DEEP=s5-03 bun tests/e2e/keyboard-cdp.ts
 *
 * 与 `flow-cdp.ts` / `s2-typed-cdp.ts` 的分工：那两个脚本用页面的 `.click()`（等价于鼠标）
 * 推任务，验的是「任务能不能完成」；这个脚本全程只发真实按键事件（Tab / Enter / Space / Escape /
 * 逐字符输入），验的是「不用鼠标能不能完成」——这正是 AGENTS.md 的「维持键盘可达、清晰焦点态」：
 *
 *   1. 从文档开头按 Tab 走满一圈，每一步都得有可见焦点环，一个「看不见焦点在哪」的停靠点都不许有；
 *   2. 音效开关只能由学习者主动操作触发，键盘 Space 要能切换，并同步 aria-pressed 与可见文案；
 *   3. 词条 Enter 能打开、Escape 能关闭，并把焦点交还给刚才那个词条；
 *   4. 步进门闩对键盘同样有效：Tab 够得到（aria-disabled 保留可发现性），但 Enter 与 Space 都推不动进度，
 *      面板照旧藏着，状态区还要说明原因；
 *   5. 深路径课全程只用键盘：走到微练习空位逐字符敲进去、按检查、作答小测、提交拿解析。
 *      其中「每按一次 Space 答完一题，焦点要留在同一题组」是本轮修掉的真缺陷的回归位——
 *      修复前作答会把题目区整块重渲染、焦点掉回文档主体，焦点环当场消失。
 *
 * 它不在 `bun test` 范围内：需要真实浏览器，属于体验验收，不是单元测试。
 * 结构契约（新写的课不能让同一类缺陷复活）由 `tests/keyboard-access-contract.test.ts` 在 `bun test` 里守。
 *
 * 可用环境变量覆盖默认值：
 *   CSP_E2E_PORT / CSP_E2E_CDP_PORT / CSP_E2E_CHROME / CSP_E2E_ORIGIN
 *   CSP_E2E_KEYBOARD_LESSONS  只跑指定课程的结构检查，逗号分隔
 *   CSP_E2E_KEYBOARD_DEEP     只跑指定课程的键盘深路径，逗号分隔
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lessonDirectoryName, loadCurriculum } from "../../scripts/curriculum.ts";
import { lessonFlows, type LessonConfig } from "./lesson-flows.ts";

const projectRoot = `${import.meta.dir}/../..`;
const port = Number(Bun.env.CSP_E2E_PORT ?? 4573);
const cdpPort = Number(Bun.env.CSP_E2E_CDP_PORT ?? 9373);
const origin = Bun.env.CSP_E2E_ORIGIN ?? `http://localhost:${port}`;
const chromeCandidates = [
  Bun.env.CSP_E2E_CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter((value): value is string => typeof value === "string" && value.length > 0);

/** 结构检查每课固定 8 项；它同时是文档里数字的来源，跑完会拿它自查。 */
const checksPerLesson = 8;
/** 深路径课每课固定 4 项。 */
const deepChecksPerLesson = 4;
/** 默认跑键盘深路径的课：一节第一阶段、一节第三阶段，覆盖不同课型与不同面板布局。 */
const defaultDeepLessons = ["s1-02", "s3-01"];
/** Tab 上限：最长的一课走满一圈约 50 个停靠点，给足余量后仍能停住，避免脚本转不出来。 */
const maxTabsPerCycle = 220;

const splitList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const requestedLessons = splitList(Bun.env.CSP_E2E_KEYBOARD_LESSONS);
const requestedDeep = splitList(Bun.env.CSP_E2E_KEYBOARD_DEEP);

const curriculum = await loadCurriculum();
const allDirectories = curriculum.map((course) => lessonDirectoryName(course.id));
const deepDirectories = requestedDeep.length > 0 ? requestedDeep : defaultDeepLessons;

for (const directory of [...requestedLessons, ...deepDirectories]) {
  if (!allDirectories.includes(directory)) {
    console.error(`不认识这节课：${directory}`);
    process.exit(1);
  }
}

const selectedLessons = requestedLessons.length > 0 ? requestedLessons : allDirectories;
const selectedDeep = deepDirectories.filter((directory) => selectedLessons.includes(directory));

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const servers: Bun.Subprocess[] = [];
const browsers: Bun.Subprocess[] = [];
const tempDirs: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  const mark = ok ? "ok  " : "FAIL";
  console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function reachable(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(url: string, description: string, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await reachable(url)) return;
    await Bun.sleep(250);
  }
  throw new Error(`等待超时：${description}`);
}

function collect(stream: ReadableStream<Uint8Array> | undefined) {
  if (!stream) return;
  (async () => {
    for await (const chunk of stream) void chunk;
  })().catch(() => {});
}

async function ensureDevServer() {
  if (Bun.env.CSP_E2E_ORIGIN) return;
  if (await reachable(`${origin}/index.html`)) return;

  console.log(`启动开发服务器：${origin}`);
  const server = Bun.spawn(["bun", "scripts/dev.ts"], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port) },
    stdout: "pipe",
    stderr: "pipe",
  });
  servers.push(server);
  collect(server.stdout as ReadableStream<Uint8Array>);
  collect(server.stderr as ReadableStream<Uint8Array>);
  await waitFor(`${origin}/index.html`, "开发服务器");
}

async function ensureChrome() {
  const endpoint = `http://localhost:${cdpPort}/json/version`;
  if (await reachable(endpoint)) return;

  const binary = chromeCandidates.find((candidate) => existsSync(candidate));
  if (!binary) {
    throw new Error(`未找到 Chrome。请安装 Chrome，或用 CSP_E2E_CHROME 指定路径（已尝试：${chromeCandidates.join("、")}）。`);
  }

  const profileDir = mkdtempSync(join(tmpdir(), "csp-e2e-keyboard-profile-"));
  tempDirs.push(profileDir);
  console.log(`启动无头 Chrome：${binary}`);
  const browser = Bun.spawn(
    [
      binary,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${cdpPort}`,
      "about:blank",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  browsers.push(browser);
  collect(browser.stdout as ReadableStream<Uint8Array>);
  collect(browser.stderr as ReadableStream<Uint8Array>);
  await waitFor(endpoint, "无头 Chrome 调试端口");
}

class Cdp {
  #socket: WebSocket;
  #pending = new Map<number, (message: any) => void>();
  #seq = 0;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.#pending.has(message.id)) {
        this.#pending.get(message.id)!(message);
        this.#pending.delete(message.id);
      }
    };
  }

  static async attach() {
    const targets = (await (await fetch(`http://localhost:${cdpPort}/json/list`)).json()) as any[];
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (!page) throw new Error("没有可用的浏览器页面目标。");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("无法连接浏览器调试通道。"));
    });
    const client = new Cdp(socket);
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    return client;
  }

  send(method: string, params: Record<string, unknown> = {}) {
    const id = ++this.#seq;
    return new Promise<any>((resolve) => {
      this.#pending.set(id, resolve);
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const message = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (message.result?.exceptionDetails) {
      throw new Error(`页面抛出异常：${JSON.stringify(message.result.exceptionDetails).slice(0, 400)}`);
    }
    return message.result?.result?.value as T;
  }

  async navigate(url: string) {
    await this.send("Page.navigate", { url });

    // 不用固定等待猜加载时间：负载高时 650ms 可能还没跑完页面自己的脚本，
    // 后面每一项检查都会读到半成品 DOM。等到 readyState 变成 complete 再走。
    const deadline = Date.now() + 20000;

    while (Date.now() < deadline) {
      const state = await this.evaluate<string>("document.readyState").catch(() => null);
      if (state === "complete") return;
      await Bun.sleep(50);
    }

    throw new Error(`页面在 20 秒内没有加载完：${url}`);
  }

  /** 真实按键：按下再抬起，中间不做任何 DOM 操作。 */
  async press(key: string, code: string, virtualKeyCode: number, text?: string) {
    await this.send("Input.dispatchKeyEvent", {
      type: text ? "keyDown" : "rawKeyDown",
      key,
      code,
      windowsVirtualKeyCode: virtualKeyCode,
      nativeVirtualKeyCode: virtualKeyCode,
      ...(text ? { text, unmodifiedText: text } : {}),
    });
    await this.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
      windowsVirtualKeyCode: virtualKeyCode,
      nativeVirtualKeyCode: virtualKeyCode,
    });
    await Bun.sleep(25);
  }

  tab() {
    return this.press("Tab", "Tab", 9);
  }

  enter() {
    return this.press("Enter", "Enter", 13, "\r");
  }

  space() {
    return this.press(" ", "Space", 32, " ");
  }

  escape() {
    return this.press("Escape", "Escape", 27);
  }

  /** 逐字符敲键盘，触发页面真实的 keydown/input 处理。 */
  async typeText(text: string) {
    for (const char of text) {
      await this.press(char, "", 0, char);
    }
  }

  close() {
    this.#socket.close();
  }
}

const quote = (value: string) => JSON.stringify(value);

/** 焦点探针：只在页面里读状态，不制造任何事件。 */
const FOCUS_PROBE = `JSON.stringify((() => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return { done: true };
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return {
    done: false,
    tag: el.tagName,
    id: el.id || "",
    cls: String(el.className || "").slice(0, 40),
    type: el.type || "",
    name: el.name || "",
    value: el.value === undefined ? "" : String(el.value),
    checked: el.checked === true,
    step: el.dataset ? (el.dataset.step ?? null) : null,
    text: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 24),
    outline: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0,
    shadow: style.boxShadow !== "none",
    onScreen: rect.width > 0 && rect.height > 0,
    expanded: el.getAttribute ? el.getAttribute("aria-expanded") : null,
    pressed: el.getAttribute ? el.getAttribute("aria-pressed") : null,
  };
})())`;

const CLEAR_MARKS = `(() => { document.querySelectorAll("[data-kbd-target]").forEach((el) => { delete el.dataset.kbdTarget; }); return true; })()`;

const markOne = (handle: string, finder: string) =>
  `(() => { const el = ${finder}; if (!el) return false; el.dataset.kbdTarget = ${quote(handle)}; return true; })()`;

/** Tab 直到焦点落在带这个标记的元素上；焦点会绕圈，所以给足上限。 */
async function tabTo(cdp: Cdp, handle: string, limit = maxTabsPerCycle) {
  for (let attempt = 0; attempt < limit; attempt += 1) {
    await cdp.tab();
    const arrived = await cdp.evaluate<boolean>(
      `document.activeElement && document.activeElement.dataset && document.activeElement.dataset.kbdTarget === ${quote(handle)}`,
    );
    if (arrived) return { arrived: true, tabs: attempt + 1 };
  }
  return { arrived: false, tabs: limit };
}

async function activate(cdp: Cdp, handle: string, key: "space" | "enter", limit = maxTabsPerCycle) {
  const reached = await tabTo(cdp, handle, limit);
  if (!reached.arrived) return { ...reached, activated: false };
  if (key === "space") await cdp.space();
  else await cdp.enter();
  return { ...reached, activated: true };
}

const focusNow = async (cdp: Cdp) => JSON.parse(await cdp.evaluate<string>(FOCUS_PROBE)) as any;

const describeFocus = (focus: any) =>
  focus?.done ? "文档主体" : `${focus?.tag ?? "?"}#${focus?.id || focus?.cls || ""}「${focus?.text ?? ""}」`;

const progressNow = (cdp: Cdp) =>
  cdp.evaluate<string>(`JSON.stringify((() => ({
    total: document.querySelectorAll("[data-step]").length,
    unlocked: typeof unlockedStepCount === "function" ? unlockedStepCount() : -1,
    quizPanelHidden: document.querySelector('[data-panel="3"]') ? document.querySelector('[data-panel="3"]').hidden : null,
    quizVisible: [...document.querySelectorAll("#quizForm input[type=radio]")].some((radio) => radio.offsetParent !== null),
    ribbon: (document.querySelector("#completionRibbon")?.textContent ?? "").trim().slice(0, 60),
  }))())`);

/**
 * 页面自己的过渡与定时器（例如词条面板 180ms 后才挂 `hidden`）在机器有负载时会晚到，
 * 所以按截止时间轮询，而不是猜一个固定等待——猜短了会误报页面缺陷，猜长了白等。
 */
async function waitUntil(cdp: Cdp, expression: string, deadlineMs = 4000) {
  const started = Date.now();

  while (Date.now() - started < deadlineMs) {
    if (await cdp.evaluate<boolean>(`Boolean(${expression})`)) {
      return { ok: true, waitedMs: Date.now() - started };
    }
    await Bun.sleep(40);
  }

  return { ok: false, waitedMs: Date.now() - started };
}

/** 结构检查：一课跑 8 项，全程只用 Tab / Enter / Space / Escape。 */
async function structureChecks(cdp: Cdp, directory: string) {
  section(`${directory} 键盘可达与焦点可见`);

  // 页面自己声明了哪些步进按钮，稍后要逐个确认它们都在 Tab 顺序里。
  const declaredSteps = JSON.parse(
    await cdp.evaluate<string>(
      `JSON.stringify([...document.querySelectorAll("[data-step]")].map((button) => String(button.dataset.step)))`,
    ),
  ) as string[];

  await cdp.evaluate(`document.activeElement && document.activeElement.blur ? document.activeElement.blur() : true`);

  const visited: any[] = [];
  const invisible: string[] = [];
  let firstSignature: string | null = null;
  let bodyStops = 0;
  let cycleComplete = false;

  for (let attempt = 0; attempt < maxTabsPerCycle; attempt += 1) {
    await cdp.tab();
    const focus = await focusNow(cdp);
    if (focus.done) {
      // 焦点停在文档主体：不算一个可达控件，但也可能是走完一圈后的落点，记下来继续。
      bodyStops += 1;
      continue;
    }

    const signature = [focus.tag, focus.id, focus.cls, focus.type, focus.name, focus.value, focus.step, focus.text].join("|");
    if (firstSignature === null) {
      firstSignature = signature;
    } else if (signature === firstSignature) {
      // 只有绕回第一个停靠点才算走满一圈；别的元素重名（同组同文案的按钮）不能提前收工。
      cycleComplete = true;
      break;
    }
    visited.push(focus);

    if (!focus.onScreen) continue;
    if (!focus.outline && !focus.shadow) invisible.push(`${focus.tag}#${focus.id}.${focus.cls}「${focus.text}」`);
  }

  check(
    "Tab 走满一圈，每个停靠点都有可见焦点环",
    cycleComplete && visited.length >= 8 && invisible.length === 0,
    cycleComplete
      ? `${visited.length} 个停靠点，${invisible.length} 个看不见焦点${invisible.length > 0 ? `：${invisible.slice(0, 3).join("、")}` : ""}${bodyStops > 0 ? `；另有 ${bodyStops} 次焦点停在文档主体` : ""}`
      : `Tab ${maxTabsPerCycle} 次仍未绕回起点（停靠点 ${visited.length} 个），无法判定`,
  );

  const tabindexFacts = JSON.parse(
    await cdp.evaluate<string>(`JSON.stringify((() => {
      const positive = [...document.querySelectorAll("[tabindex]")]
        .filter((el) => Number(el.getAttribute("tabindex")) > 0)
        .map((el) => el.tagName + "[" + el.getAttribute("tabindex") + "]");
      const negativeNative = [...document.querySelectorAll('button[tabindex="-1"], a[href][tabindex="-1"], input[tabindex="-1"], select[tabindex="-1"], textarea[tabindex="-1"]')]
        .map((el) => el.tagName + "#" + (el.id || el.className));
      return { positive, negativeNative };
    })())`),
  );

  check("没有用正数 tabindex 把控件从自然 Tab 顺序里拽出来", tabindexFacts.positive.length === 0, tabindexFacts.positive.join("、"));
  check(
    "没有把原生控件用 tabindex=\"-1\" 移出 Tab 顺序",
    tabindexFacts.negativeNative.length === 0,
    tabindexFacts.negativeNative.join("、"),
  );

  const unreachableClickTargets = JSON.parse(
    await cdp.evaluate<string>(
      `JSON.stringify((() => {
        const focusableAncestor = "a[href],button,input,select,textarea,label,[contenteditable]";
        return [...document.querySelectorAll("div,span,li,p,td,th,h1,h2,h3,strong,em")]
          .filter((el) => el.offsetParent !== null && getComputedStyle(el).cursor === "pointer")
          .filter((el) => !el.closest(focusableAncestor))
          .map((el) => el.tagName + "." + (String(el.className).slice(0, 30) || "(no class)"));
      })())`,
    ),
  ) as string[];

  check(
    "没有「看着能点、键盘够不到」的元素",
    unreachableClickTargets.length === 0,
    [...new Set(unreachableClickTargets)].slice(0, 4).join("、"),
  );

  // 音效开关：只能由学习者主动操作触发，键盘要能切换并说清当前状态。
  await cdp.evaluate(CLEAR_MARKS);
  const soundMarked = await cdp.evaluate<boolean>(markOne("sound", `document.getElementById("soundToggle")`));
  const soundBefore = await cdp.evaluate<string>(
    `JSON.stringify({ pressed: document.getElementById("soundToggle")?.getAttribute("aria-pressed"), text: (document.getElementById("soundToggle")?.textContent ?? "").trim() })`,
  );
  const soundToggled = soundMarked ? await activate(cdp, "sound", "space") : { arrived: false, activated: false, tabs: 0 };
  const soundAfter = await cdp.evaluate<string>(
    `JSON.stringify({ pressed: document.getElementById("soundToggle")?.getAttribute("aria-pressed"), text: (document.getElementById("soundToggle")?.textContent ?? "").trim() })`,
  );
  const soundBeforeValue = JSON.parse(soundBefore);
  const soundAfterValue = JSON.parse(soundAfter);

  check(
    "音效开关：Space 能切换，aria-pressed 与可见文案同步变化",
    soundToggled.activated &&
      soundAfterValue.pressed !== soundBeforeValue.pressed &&
      soundAfterValue.text !== soundBeforeValue.text &&
      soundAfterValue.text.includes(soundAfterValue.pressed === "true" ? "开" : "关"),
    `按前 ${soundBefore}，按后 ${soundAfter}（Tab ${soundToggled.tabs} 次）`,
  );

  // 词条：Enter 打开、Escape 关闭并把焦点交还给刚才那个词条。
  await cdp.evaluate(CLEAR_MARKS);
  const termMarked = await cdp.evaluate<boolean>(
    markOne("term", `[...document.querySelectorAll("button.faq-term")].find((button) => button.offsetParent !== null)`),
  );
  const termOpen = termMarked ? await activate(cdp, "term", "enter") : { arrived: false, activated: false, tabs: 0 };
  // 打开要等 `shell.hidden = false` 加上一帧后的 `.is-open`；关闭要等 180ms 后才挂的 `hidden`。
  // 两个都按页面自己的终态轮询，负载下晚到不算缺陷，一直不到才算。
  const opened = await waitUntil(
    cdp,
    `(() => {
      const shell = document.getElementById("faqShell");
      const trigger = document.querySelector('[data-kbd-target="term"]');
      return !!shell && shell.hidden === false && shell.classList.contains("is-open") && !!trigger && trigger.getAttribute("aria-expanded") === "true";
    })()`,
  );
  const openState = JSON.parse(
    await cdp.evaluate<string>(`JSON.stringify((() => {
      const shell = document.getElementById("faqShell");
      const trigger = document.querySelector('[data-kbd-target="term"]');
      return {
        shellOpen: !!shell && shell.hidden === false && shell.classList.contains("is-open"),
        expanded: trigger ? trigger.getAttribute("aria-expanded") : null,
      };
    })())`),
  );

  await cdp.escape();
  const closed = await waitUntil(
    cdp,
    `(() => {
      const shell = document.getElementById("faqShell");
      const trigger = document.querySelector('[data-kbd-target="term"]');
      return !!shell && shell.hidden === true && !shell.classList.contains("is-open") && !!trigger && trigger.getAttribute("aria-expanded") === "false";
    })()`,
  );
  const closeState = JSON.parse(
    await cdp.evaluate<string>(`JSON.stringify((() => {
      const shell = document.getElementById("faqShell");
      const trigger = document.querySelector('[data-kbd-target="term"]');
      return {
        shellOpen: !!shell && (shell.hidden === false || shell.classList.contains("is-open")),
        expanded: trigger ? trigger.getAttribute("aria-expanded") : null,
        focusReturned: document.activeElement === trigger,
      };
    })())`),
  );

  check(
    "词条：Enter 打开、Escape 关闭，并把焦点交还给刚才那个词条",
    termOpen.activated &&
      opened.ok &&
      openState.shellOpen &&
      openState.expanded === "true" &&
      closed.ok &&
      !closeState.shellOpen &&
      closeState.expanded === "false" &&
      closeState.focusReturned,
    `打开 shellOpen=${openState.shellOpen} aria-expanded=${openState.expanded}（${opened.waitedMs}ms 到位）；Escape 后 shellOpen=${closeState.shellOpen} aria-expanded=${closeState.expanded}（${closed.waitedMs}ms 到位）焦点回来了=${closeState.focusReturned}`,
  );

  // 步进门闩：Tab 够得到，但 Enter 与 Space 都不能推着进度走。
  await cdp.navigate(`${origin}/lessons/${directory}/index.html`);
  await cdp.evaluate(CLEAR_MARKS);
  const gateMarked = await cdp.evaluate<boolean>(
    markOne("gate", `[...document.querySelectorAll("[data-step]")].find((button) => button.getAttribute("aria-disabled") === "true")`),
  );
  const gateBefore = JSON.parse(await progressNow(cdp));
  const gateReached = gateMarked ? await tabTo(cdp, "gate") : { arrived: false, tabs: 0 };
  const gateFocus = await focusNow(cdp);
  await cdp.enter();
  const gateAfterEnter = JSON.parse(await progressNow(cdp));
  await cdp.space();
  const gateAfterSpace = JSON.parse(await progressNow(cdp));

  check(
    "步进门闩：Tab 够得到，但 Enter 与 Space 都推不动进度（面板照旧藏着，状态区说明原因）",
    gateMarked &&
      gateReached.arrived &&
      gateFocus.step !== null &&
      gateBefore.unlocked === gateAfterEnter.unlocked &&
      gateBefore.unlocked === gateAfterSpace.unlocked &&
      gateBefore.quizPanelHidden === gateAfterSpace.quizPanelHidden &&
      gateAfterSpace.ribbon.length > 0,
    `Tab ${gateReached.tabs} 次到第 ${gateFocus.step} 步；unlocked ${gateBefore.unlocked} → ${gateAfterEnter.unlocked} → ${gateAfterSpace.unlocked}；状态区「${gateAfterSpace.ribbon}」`,
  );

  const visitedSteps = new Set(visited.map((entry) => entry.step).filter((step: string | null) => step !== null && step !== undefined));
  const missingSteps = declaredSteps.filter((step) => !visitedSteps.has(step));

  check(
    "步进轨道的每一步都在 Tab 顺序里（门闩挡住的也能被键盘发现）",
    declaredSteps.length > 0 && missingSteps.length === 0,
    `${declaredSteps.length} 步，Tab 走到 ${visitedSteps.size} 步${missingSteps.length > 0 ? `，走不到：${missingSteps.join("、")}` : ""}`,
  );
}

/** 深路径课：全程只用键盘，把微练习空位填对、作答小测、提交拿解析。 */
async function deepChecks(cdp: Cdp, directory: string, config: LessonConfig) {
  section(`${directory} 键盘深路径：微练习 → 小测 → 提交`);
  await cdp.navigate(`${origin}/lessons/${directory}/index.html`);

  const blanks = [{ id: config.input, answer: config.good }];
  if (config.secondBlank) blanks.push({ id: config.secondBlank.input, answer: config.secondBlank.good });

  const trace: string[] = [];
  let progressBefore = -1;
  let progressAfter = -1;

  for (let round = 0; round < 8; round += 1) {
    const before = JSON.parse(await progressNow(cdp));

    const filled = await fillBlankByKeyboard(cdp, blanks, config);
    const picks = await pickGroupsByKeyboard(cdp);
    const swept = await sweepActionsByKeyboard(cdp);

    const after = JSON.parse(await progressNow(cdp));
    trace.push(`第 ${round + 1} 轮：填空 ${filled}、选项 ${picks.length}、其他按钮 ${swept.length}，进度 ${before.unlocked} → ${after.unlocked}`);
    progressBefore = after.unlocked;

    if (after.quizVisible) break;
    if (filled === 0 && picks.length === 0 && swept.length === 0) break;
  }

  const settled = JSON.parse(await progressNow(cdp));
  progressAfter = settled.unlocked;
  const blankTyped = await cdp.evaluate<string | null>(
    `(() => { const el = document.getElementById(${quote(config.input)}); return el ? el.value : null; })()`,
  );

  check(
    "只用键盘：走到微练习空位、逐字符敲进去、按检查，进度真的往前走了",
    settled.quizVisible && blankTyped === config.good && progressAfter > progressBefore - 1 && progressAfter >= 1,
    `空位现值「${blankTyped}」，进度 ${settled.unlocked}/${settled.total}；${trace.join("；")}`,
  );

  // 小测：每题 Tab 进组、按 Space 作答，焦点必须留在同一题组（本轮修复的回归位）。
  const questions = JSON.parse(
    await cdp.evaluate<string>(`JSON.stringify((() => {
      const pool = typeof questionPool !== "undefined" ? questionPool : [];
      return [...new Set([...document.querySelectorAll("#quizForm input[type=radio]")].map((radio) => radio.name))].map((name) => {
        const question = pool.find((entry) => entry.id === name);
        return { name, answer: question ? question.answer : -1 };
      });
    })())`),
  ) as { name: string; answer: number }[];

  const answerTrace: string[] = [];
  let everyFocusKept = questions.length > 0;
  let answered = 0;
  // 还没作答时的提交按钮状态：原生 disabled 才够不到，这是「答不完就没法蒙提交」的失败路径。
  const submitBeforeAnswer = JSON.parse(
    await cdp.evaluate<string>(`JSON.stringify({
      disabled: document.getElementById("submitQuizButton")?.disabled === true,
      text: (document.getElementById("submitQuizButton")?.textContent ?? "").trim(),
    })`),
  );

  for (const question of questions) {
    if (question.answer < 0) {
      everyFocusKept = false;
      answerTrace.push(`${question.name}：题库里找不到正确选项`);
      continue;
    }

    await cdp.evaluate(CLEAR_MARKS);
    const marked = await cdp.evaluate<boolean>(
      markOne(
        "radio",
        `[...document.querySelectorAll("#quizForm input[type=radio]")].find((radio) => radio.name === ${quote(question.name)} && radio.value === ${quote(String(question.answer))})`,
      ),
    );
    if (!marked) {
      everyFocusKept = false;
      answerTrace.push(`${question.name}：找不到那一项`);
      continue;
    }

    const reached = await tabTo(cdp, "radio", maxTabsPerCycle);
    await cdp.space();
    const focus = await focusNow(cdp);
    const kept = focus.name === question.name && focus.checked === true;
    if (kept) answered += 1;
    else everyFocusKept = false;
    answerTrace.push(`${question.name}：Tab ${reached.tabs} 次 → Space 后焦点仍在同组=${kept}（焦点=${focus.tag}.${focus.name || focus.id || ""}）`);
  }

  check(
    "只用键盘：每题都按 Space 作答，答完焦点仍留在同一题组（没有掉回文档开头）",
    everyFocusKept && answered === questions.length && questions.length >= 3,
    `${questions.length} 题答对焦点 ${answered} 题；${answerTrace.join("；")}`,
  );

  // 答满之后提交按钮才可用；答不上来时它必须是原生 disabled（键盘也够不到）。
  const submitState = JSON.parse(
    await cdp.evaluate<string>(`JSON.stringify({
      disabled: document.getElementById("submitQuizButton")?.disabled === true,
      text: (document.getElementById("submitQuizButton")?.textContent ?? "").trim(),
    })`),
  );

  await cdp.evaluate(CLEAR_MARKS);
  const submitMarked = await cdp.evaluate<boolean>(markOne("submit", `document.getElementById("submitQuizButton")`));
  const submitted = submitMarked ? await activate(cdp, "submit", "space") : { arrived: false, activated: false, tabs: 0 };
  const focusRightAfterSubmit = (await focusNow(cdp)) as any;
  await Bun.sleep(350);
  const focusSettledAfterSubmit = (await focusNow(cdp)) as any;
  const result = JSON.parse(
    await cdp.evaluate<string>(`JSON.stringify({
      text: (document.getElementById("quizResult")?.textContent ?? "").trim().slice(0, 80),
      explanations: document.querySelectorAll("#quizForm .explanation").length,
    })`),
  );

  check(
    "没答完时提交按钮是原生 disabled（够不到），答满后键盘提交能拿到得分与逐题解析，焦点交给结果区",
    submitBeforeAnswer.disabled &&
      submitBeforeAnswer.text.includes("还差") &&
      !submitState.disabled &&
      submitted.activated &&
      /本次答对\s*\d+\s*\/\s*\d+/.test(result.text) &&
      result.explanations >= 3 &&
      focusSettledAfterSubmit.id === "quizResult",
    `作答前「${submitBeforeAnswer.text}」disabled=${submitBeforeAnswer.disabled}；作答后 disabled=${submitState.disabled}；Tab ${submitted.tabs} 次提交得到「${result.text}」解析 ${result.explanations} 段；提交后焦点先是 ${describeFocus(focusRightAfterSubmit)}，350ms 后是 ${describeFocus(focusSettledAfterSubmit)}`,
  );

  const repeatable = JSON.parse(
    await cdp.evaluate<string>(`JSON.stringify({
      submitDisabled: document.getElementById("submitQuizButton")?.disabled === true,
      submitText: (document.getElementById("submitQuizButton")?.textContent ?? "").trim(),
    })`),
  );

  await cdp.evaluate(CLEAR_MARKS);
  const freshMarked = await cdp.evaluate<boolean>(markOne("fresh", `document.getElementById("newQuizButton")`));
  const freshReached = freshMarked ? await tabTo(cdp, "fresh") : { arrived: false, tabs: 0 };

  check(
    "提交后不能重复提交，且「换一套题」仍然够得到（复习出口没被键盘堵死）",
    repeatable.submitDisabled && freshReached.arrived,
    `提交按钮 disabled=${repeatable.submitDisabled}「${repeatable.submitText}」；Tab ${freshReached.tabs} 次到「换一套题」`,
  );
}

/** 键盘走到空位、逐字符敲进去，再按检查。 */
async function fillBlankByKeyboard(cdp: Cdp, blanks: { id: string; answer: string }[], config: LessonConfig) {
  let filled = 0;

  for (const blank of blanks) {
    const needed = await cdp.evaluate<boolean>(
      `(() => { const el = document.getElementById(${quote(blank.id)}); return !!el && el.offsetParent !== null && el.value !== ${quote(blank.answer)}; })()`,
    );
    if (!needed) continue;

    await cdp.evaluate(CLEAR_MARKS);
    const marked = await cdp.evaluate<boolean>(markOne("blank", `document.getElementById(${quote(blank.id)})`));
    if (!marked) continue;
    const reached = await tabTo(cdp, "blank");
    if (!reached.arrived) continue;

    // 先清干净再逐字符敲，避免上一轮的残留把答案拼错。
    await cdp.evaluate(`(() => { const el = document.getElementById(${quote(blank.id)}); if (el) el.value = ""; return true; })()`);
    await cdp.typeText(blank.answer);

    const typed = await cdp.evaluate<string | null>(
      `(() => { const el = document.getElementById(${quote(blank.id)}); return el ? el.value : null; })()`,
    );
    if (typed !== blank.answer) continue;

    await cdp.evaluate(CLEAR_MARKS);
    const checkMarked = await cdp.evaluate<boolean>(markOne("check", `document.getElementById(${quote(config.check)})`));
    if (!checkMarked) continue;
    const activated = await activate(cdp, "check", "space");
    if (activated.activated) filled += 1;
  }

  return filled;
}

/** 互斥选项组：按顺序用键盘试到这一组出现 is-correct 就停（点错会覆盖已选对的答案）。 */
async function pickGroupsByKeyboard(cdp: Cdp) {
  const groups = JSON.parse(
    await cdp.evaluate<string>(`JSON.stringify((() => {
      const parents = [];
      for (const button of document.querySelectorAll("button[data-choice], button[data-concept]")) {
        if (!button.offsetParent || button.disabled) continue;
        const parent = button.parentElement;
        if (parent && !parents.includes(parent)) parents.push(parent);
      }
      return parents.map((parent, index) => {
        const buttons = [...parent.querySelectorAll("button")].filter((button) => button.dataset.choice || button.dataset.concept);
        buttons.forEach((button, option) => { button.dataset.kbdTarget = "g" + index + "o" + option; });
        return {
          index,
          solved: buttons.some((button) => button.classList.contains("is-correct")),
          count: buttons.length,
        };
      });
    })())`),
  ) as { index: number; solved: boolean; count: number }[];

  const picked: string[] = [];

  for (const group of groups) {
    if (group.solved) continue;

    for (let option = 0; option < group.count; option += 1) {
      const activated = await activate(cdp, `g${group.index}o${option}`, "space");
      if (!activated.activated) break;

      const solved = await cdp.evaluate<boolean>(
        `[...document.querySelectorAll('[data-kbd-target^="g${group.index}o"]')].some((button) => button.classList.contains("is-correct"))`,
      );
      if (solved) {
        picked.push(`g${group.index}o${option}`);
        break;
      }
    }
  }

  return picked;
}

/** 剩下「推进任务」的按钮：演示/揭示类，排除重置、提示、参考、音效、词条、提交、换卷与空位检查。 */
async function sweepActionsByKeyboard(cdp: Cdp) {
  const targets = JSON.parse(
    await cdp.evaluate<string>(`JSON.stringify((() => {
      const DENY = /reset|hint|ref|sound|faq|toggle|submit|check|newquiz/i;
      const buttons = [...document.querySelectorAll("button")]
        .filter((button) => !button.disabled && button.offsetParent !== null)
        .filter((button) => !DENY.test(button.id))
        .filter((button) => !button.dataset.faq && !button.classList.contains("faq-term"))
        .filter((button) => !button.dataset.choice && !button.dataset.concept && !button.dataset.fix)
        .filter((button) => !button.closest("[data-step]"))
        .filter((button) => {
          const panel = button.closest("[data-panel]");
          return panel ? !panel.hidden : true;
        });
      buttons.forEach((button, index) => { button.dataset.kbdTarget = "action" + index; });
      return buttons.map((button, index) => ({ handle: "action" + index, label: button.id || (button.textContent || "").trim().slice(0, 14) }));
    })())`),
  ) as { handle: string; label: string }[];

  const pressed: string[] = [];

  for (const target of targets) {
    const activated = await activate(cdp, target.handle, "space", 320);
    if (activated.activated) pressed.push(target.label);
  }

  return pressed;
}

// ---------------------------------------------------------------------------

let failures = 0;

try {
  await ensureDevServer();
  await ensureChrome();
  const cdp = await Cdp.attach();

  try {
    for (const directory of selectedLessons) {
      await cdp.navigate(`${origin}/lessons/${directory}/index.html`);
      await structureChecks(cdp, directory);
    }

    for (const directory of selectedDeep) {
      const config = lessonFlows.find((lesson) => lesson.directory === directory);
      if (!config) throw new Error(`lesson-flows.ts 里没有 ${directory} 的配置，无法跑键盘深路径`);
      await deepChecks(cdp, directory, config);
    }
  } finally {
    cdp.close();
  }
} finally {
  for (const server of servers) server.kill();
  for (const browser of browsers) browser.kill();
  for (const directory of tempDirs) rmSync(directory, { recursive: true, force: true });
}

const expectedStructure = selectedLessons.length * checksPerLesson;
const expectedDeep = selectedDeep.length * deepChecksPerLesson;
const expectedTotal = expectedStructure + expectedDeep;

for (const entry of checks) if (!entry.ok) failures += 1;

console.log(
  `\n结构检查每课 ${checksPerLesson} 项 × ${selectedLessons.length} 课 + 键盘深路径每课 ${deepChecksPerLesson} 项 × ${selectedDeep.length} 课 = ${expectedTotal} 项；实跑 ${checks.length} 项，失败 ${failures} 项。`,
);

if (checks.length !== expectedTotal) {
  console.error(
    `\n检查项数与声明不符：实际跑了 ${checks.length} 项，声明的是 ${expectedTotal} 项。` +
      `\n请同步 checksPerLesson / deepChecksPerLesson、tests/e2e/keyboard-manual-checklist.md、docs/roadmap.md、docs/feature-checklist.md 与 README.md 里的数字。`,
  );
  process.exit(1);
}

if (failures > 0) {
  console.error(`\n键盘可达复验未通过：${failures} 项失败。`);
  process.exit(1);
}

console.log(`键盘可达与焦点可见复验通过：${selectedLessons.length} 课结构 + ${selectedDeep.length} 课键盘深路径。`);
