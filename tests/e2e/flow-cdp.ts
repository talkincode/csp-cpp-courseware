#!/usr/bin/env bun
/**
 * 整课推进的浏览器自动化复验（零依赖）。
 *
 * 用法：
 *   bun run e2e:flow               全部三十九课（S1-02 至 S5-08）
 *   bun run e2e:flow:s1            第一阶段
 *   CSP_E2E_LESSONS=s1-03,s5-04 bun tests/e2e/flow-cdp.ts   只跑指定几课
 *
 * 与 `s2-typed-cdp.ts` 的分工：那个脚本验「这一个空位本身」（出现时机、全角符号、语义写错、
 * 兜底按钮、草稿恢复）；这个脚本验「整节课能不能从头走到尾」——把 0 / N 推到 N / N、
 * 每一步都要经过真实浏览器点击、跳步会被拦住、刷新后进度还在、清掉本地存储就回到起点，
 * 再趁小测面板可见时把卷子量一遍（目标绑定、未答完不可提交、提交后得分与解析、没考住的复习出口），
 * 最后量完成态自己揭开的「继续学习」入口（下一课路径、文案与可达性，最后一课换成课程收尾出口）。
 * 每课 19 项，39 课共 741 项。两个脚本共用 `lesson-flows.ts` 里的答案，改一处两边同时生效。
 *
 * S1-01 不在这张表里：它的八个场景由 `s1-01-cdp.ts` 单独复验，粒度更细。
 *
 * 它不在 `bun test` 范围内：需要真实浏览器，属于体验验收，不是单元测试。
 *
 * 可用环境变量覆盖默认值：
 *   CSP_E2E_PORT      开发服务器端口（默认 4473）
 *   CSP_E2E_CDP_PORT  无头 Chrome 的调试端口（默认 9363）
 *   CSP_E2E_CHROME    Chrome 可执行文件路径
 *   CSP_E2E_ORIGIN    复用已在运行的服务地址（设置后不自行启动服务器）
 *   CSP_E2E_LESSONS   只跑指定课程，逗号分隔（如 s1-03,s5-04）
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lessonDirectoryName, loadCurriculum } from "../../scripts/curriculum.ts";
import { lessonFlows, type LessonConfig } from "./lesson-flows.ts";

const projectRoot = `${import.meta.dir}/../..`;
const port = Number(Bun.env.CSP_E2E_PORT ?? 4473);
const cdpPort = Number(Bun.env.CSP_E2E_CDP_PORT ?? 9363);
const origin = Bun.env.CSP_E2E_ORIGIN ?? `http://localhost:${port}`;
const chromeCandidates = [
  Bun.env.CSP_E2E_CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter((value): value is string => typeof value === "string" && value.length > 0);

const requestedLessons = (Bun.env.CSP_E2E_LESSONS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
const unknownLessons = requestedLessons.filter((value) => !lessonFlows.some((lesson) => lesson.directory === value));

if (unknownLessons.length > 0) {
  console.error(`CSP_E2E_LESSONS 里有不认识的课程：${unknownLessons.join(", ")}`);
  process.exit(1);
}

const selectedLessons =
  requestedLessons.length > 0
    ? lessonFlows.filter((lesson) => requestedLessons.includes(lesson.directory))
    : lessonFlows;

// 课后「继续学习」入口要指向 courseData 里的下一课；最后一课给的是课程收尾出口。
const curriculum = await loadCurriculum();
const nextLessonOf = (directory: string) => {
  const index = curriculum.findIndex((course) => lessonDirectoryName(course.id) === directory);
  if (index === -1) throw new Error(`课程顺序里找不到 ${directory}`);
  return curriculum[index + 1] ?? null;
};

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const servers: Bun.Subprocess[] = [];
const browsers: Bun.Subprocess[] = [];
const tempDirs: string[] = [];
const chromeLog: string[] = [];

/**
 * 每课固定跑几项检查。它是文档里「每课 N 项 / 共 M 项」的唯一来源：
 * 加了一条检查却忘了改这里，本轮跑完就会当场失败；改了这里但没同步文档与清单，
 * `tests/e2e-count-facts.test.ts` 会失败。
 */
const checksPerLesson = 19;

function check(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -> ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function reachable(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(url: string, description: string, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    if (await reachable(url)) return;
    await Bun.sleep(250);
  }
  const tail = chromeLog.slice(-12).join("\n");
  throw new Error(`等待${description}超时：${url}${tail ? `\nChrome 输出末尾：\n${tail}` : ""}`);
}

function collect(stream: ReadableStream<Uint8Array> | undefined) {
  if (!stream) return;
  void (async () => {
    for await (const chunk of stream) chromeLog.push(new TextDecoder().decode(chunk));
  })();
}

async function ensureDevServer() {
  if (Bun.env.CSP_E2E_ORIGIN || (await reachable(`${origin}/`))) return;
  console.log(`启动开发服务器：bun scripts/dev.ts（端口 ${port}）`);
  servers.push(
    Bun.spawn(["bun", "scripts/dev.ts"], {
      cwd: projectRoot,
      env: { ...Bun.env, PORT: String(port) },
      stdout: "ignore",
      stderr: "ignore",
    }),
  );
  await waitFor(`${origin}/`, "开发服务器");
}

async function ensureChrome() {
  const endpoint = `http://localhost:${cdpPort}/json/version`;
  if (await reachable(endpoint)) return;

  const binary = chromeCandidates.find((candidate) => existsSync(candidate));
  if (!binary) {
    throw new Error(
      `未找到 Chrome。请安装 Chrome，或用 CSP_E2E_CHROME 指定可执行文件路径（已尝试：${chromeCandidates.join("、")}）。`,
    );
  }

  const profileDir = mkdtempSync(join(tmpdir(), "csp-e2e-flow-profile-"));
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

  static async attach(cdpPort: number) {
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
      throw new Error(`页面抛出异常：${JSON.stringify(message.result.exceptionDetails).slice(0, 500)}`);
    }
    return message.result?.result?.value as T;
  }

  async evaluateJson<T = Record<string, unknown>>(expression: string): Promise<T> {
    return JSON.parse(await this.evaluate<string>(expression)) as T;
  }

  close() {
    this.#socket.close();
  }
}

/**
 * 在页面里把整节课推到完成。
 *
 * 页面把「哪一步算完成」写在 `unlockedStepCount()` 里，把总步数写在步进轨道的 `data-step` 上，
 * 所以脚本不必知道每课具体问什么：它按同一套规则驱动——
 *   1. 把这一课的空位按 `lesson-flows.ts` 的答案填进去并点「检查」；
 *   2. 互斥选项按组试：点一个、看这组有没有出现 `is-correct`，出现了就换下一组；
 *   3. 剩下的演示/揭示类按钮按一遍（跳过重置/提示/参考/音效/词条/提交）；
 *   4. 小测按页面自己 `questionPool` 里的正确答案选完并提交。
 * 每轮之后再读一次 `unlockedStepCount()`，涨了就继续，涨不动就停，最多八轮。
 *
 * 第 2 步为什么不能「全点一遍」：点错会先把错的答案写进状态（如 s2-05 的
 * `state.formulaChoices[quantity] = choice`）再判对错，所以扫到最后会把已经选对的覆盖成错的，
 * 走到一半就卡住。只看 `is-correct` 才动手，从头到尾不会破坏任何已经做对的答案。
 */
function driver(lesson: LessonConfig) {
  const config = JSON.stringify({
    input: lesson.input,
    check: lesson.check,
    good: lesson.good,
    secondBlank: lesson.secondBlank ?? null,
  });

  return `(async () => {
  const CONFIG = ${config};
  // 这些按钮不属于「推进任务」：重置会清空答案，提示/参考只是辅助，音效、词条面板与提交另有断言。
  const DENY = /reset|hint|ref|sound|faq|toggle|submit|check/i;
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  const total = document.querySelectorAll("[data-step]").length;
  const unlocked = () => (typeof unlockedStepCount === "function" ? unlockedStepCount() : -1);
  const progressText = () => (document.querySelector("#taskProgress")?.textContent ?? "").trim();
  const ribbonText = () => (document.querySelector("#completionRibbon")?.textContent ?? "").trim();
  const panelHidden = (index) => {
    const panel = document.querySelector('[data-panel="' + index + '"]');
    return panel ? panel.hidden : null;
  };

  const baseline = {
    total,
    unlocked: unlocked(),
    progress: progressText(),
    taskZeroHidden: panelHidden(0),
    nextStepHidden: document.querySelector("#nextStep")?.hidden ?? null,
  };

  // 一上来就想跳到最后一格：应当被拦住，仍停在第一步。
  const rail = [...document.querySelectorAll("[data-step]")];
  const lastRail = rail[rail.length - 1];
  const lastStep = lastRail ? Number(lastRail.dataset.step) : -1;
  if (lastRail) lastRail.click();
  await tick();
  const jump = {
    unlocked: unlocked(),
    progress: progressText(),
    taskZeroHidden: panelHidden(0),
    ribbon: ribbonText(),
  };

  const clickableOthers = () =>
    [...document.querySelectorAll("button")]
      .filter((button) => !button.disabled && button.offsetParent !== null)
      .filter((button) => !DENY.test(button.id))
      .filter((button) => !button.dataset.faq && !button.classList.contains("faq-term"))
      // 互斥选项另有「点对为止」的走法，这里只按演示/揭示类按钮。
      .filter((button) => !button.dataset.choice && !button.dataset.concept && !button.dataset.fix)
      // 步进轨道是导航，不是任务本身；跳步单独断言。
      .filter((button) => !button.closest("[data-step]"))
      .filter((button) => {
        const panel = button.closest("[data-panel]");
        return panel ? !panel.hidden : true;
      });

  const fillTyped = async () => {
    const checkButton = document.getElementById(CONFIG.check);
    // 页面只在学到那一步时把空位露出来（例如 s1-03 的 avgMicro.hidden = !state.formulasMatched）。
    // 空位还没露出来，就说明这不是学习者能走到的顺序——先让前面的任务推进，下一轮它自然会露出来。
    // 照着「页面上看得见的东西」驱动，才不会验出学习者遇不到的状态。
    if (!checkButton || checkButton.offsetParent === null) return 0;

    let changed = 0;
    const blanks = [[CONFIG.input, CONFIG.good]];
    if (CONFIG.secondBlank) blanks.push([CONFIG.secondBlank.input, CONFIG.secondBlank.good]);
    for (const [id, answer] of blanks) {
      const element = document.getElementById(id);
      if (!element || element.offsetParent === null || element.value === answer) continue;
      element.focus();
      element.value = answer;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      changed += 1;
    }
    for (let i = 0; i < 2; i += 1) {
      checkButton.click();
      await tick();
    }
    return changed;
  };

  // 互斥选项组：同一个父元素下的 data-choice / data-concept 按钮。
  const groupButtons = (parent) =>
    [...parent.querySelectorAll("button")].filter((button) => button.dataset.choice || button.dataset.concept);

  const groupParents = () => {
    const parents = [];
    for (const button of document.querySelectorAll("button[data-choice], button[data-concept]")) {
      if (!button.offsetParent || button.disabled) continue;
      const parent = button.parentElement;
      if (parent && !parents.includes(parent)) parents.push(parent);
    }
    return parents;
  };

  // 错了不要紧：这一课的「选对」会落在 is-correct 上（40 课统一），所以按顺序试到出现 is-correct 就停。
  // 不能不看对错地全点一遍——点错会覆盖掉已经选对的答案（例如 s2-05 的 state.formulaChoices），
  // 那样扫到最后永远停在错的选项上，反而把好好的课件判成走不通。
  const chooseGroups = async () => {
    const picked = [];
    for (const parent of groupParents()) {
      if (groupButtons(parent).some((button) => button.classList.contains("is-correct"))) continue;
      for (const button of groupButtons(parent)) {
        if (!button.isConnected || button.disabled || !button.offsetParent) continue;
        button.click();
        await tick();
        if (groupButtons(parent).some((entry) => entry.classList.contains("is-correct"))) {
          picked.push(button.dataset.choice ?? button.dataset.concept);
          break;
        }
      }
    }
    return picked;
  };

  const sweepOthers = async () => {
    const hits = [];
    for (const button of clickableOthers()) {
      if (!button.isConnected || button.disabled || button.offsetParent === null) continue;
      button.click();
      hits.push(button.id || button.textContent.trim().slice(0, 16));
      await tick();
    }
    return hits;
  };

  const answerQuiz = async () => {
    const form = document.querySelector("#quizForm");
    if (!form) return 0;
    const names = [...new Set([...form.querySelectorAll('input[type="radio"]')].map((radio) => radio.name))];
    if (names.length === 0) return 0;
    const pool = typeof questionPool !== "undefined" ? questionPool : [];
    let answered = 0;
    for (const name of names) {
      const question = pool.find((entry) => entry.id === name);
      if (!question) continue;
      const radio = form.querySelector('input[name="' + name + '"][value="' + question.answer + '"]');
      if (radio && !radio.checked) {
        radio.click();
        await tick();
        answered += 1;
      }
    }
    const submit = document.querySelector("#submitQuizButton");
    if (submit && !submit.disabled) {
      submit.click();
      await tick();
    }
    return answered;
  };

  const trace = [];
  for (let round = 0; round < 8; round += 1) {
    const filled = await fillTyped();
    const picked = await chooseGroups();
    const hits = await sweepOthers();
    const answered = await answerQuiz();
    const now = unlocked();
    trace.push({
      round,
      filled,
      picked,
      hits: hits.slice(0, 10),
      answered,
      unlocked: now,
      progress: progressText(),
    });
    if (now >= total) break;
    if (filled === 0 && picked.length === 0 && hits.length === 0 && answered === 0) break;
  }

  const solved = { unlocked: unlocked(), progress: progressText(), ribbon: ribbonText(), trace };

  // 课后继续学习入口：完成态应当自己揭开，并且真的能走通（不是死链）。
  const nextStep = document.querySelector("#nextStep");
  const nextLink = nextStep?.querySelector("[data-next-lesson]") ?? null;
  let nextLinkReachable = null;
  if (nextLink) {
    try {
      const response = await fetch(nextLink.href, { method: "HEAD" });
      nextLinkReachable = response.ok;
    } catch {
      nextLinkReachable = false;
    }
  }

  solved.nextStepHidden = nextStep ? nextStep.hidden : null;
  solved.courseComplete = nextStep ? nextStep.hasAttribute("data-course-complete") : null;
  solved.nextLessonTarget = nextLink ? nextLink.dataset.nextLesson : null;
  solved.nextLessonText = nextLink ? nextLink.textContent.trim() : null;
  solved.nextLessonPath = nextLink ? new URL(nextLink.href).pathname : null;
  solved.nextLessonReachable = nextLinkReachable;

  return JSON.stringify({ total, lastStep, baseline, jump, solved });
})()`;
}

/**
 * 在已经推到完成的那一页上，把小测本身再走一遍。
 *
 * 验收矩阵的「随机在线测试」一行写着「每题检查目标绑到本课学习目标原文并另起一行显示更细的本题检查」，
 * 这句话一直没人真在浏览器里看过。这里趁整课已经推完、小测面板可见时，先点「换一套题」拿回一套没提交的
 * 新卷（`refreshQuiz()` 会把 `answers` 与 `quizSubmitted` 一起复位），再按「没答完不能交 → 答满能交 →
 * 提交看解析」的顺序逐条量一遍，最后把卷子交掉，让页面回到 `quizSubmitted = true`，不打扰后面的刷新断言。
 */
function quizDriver() {
  return `(async () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const form = document.querySelector("#quizForm");
  const submit = document.querySelector("#submitQuizButton");
  const result = document.querySelector("#quizResult");
  const seed = document.querySelector("#quizSeed");
  const pool = typeof questionPool !== "undefined" ? questionPool : [];
  const objectives = typeof courseObjectives !== "undefined" ? courseObjectives : [];
  const questions = () => (typeof currentQuestions === "function" ? currentQuestions() : []);

  const out = {
    seedBefore: (seed?.textContent ?? "").trim(),
    seedAfter: "",
    questions: 0,
    uniqueIds: 0,
    nonChoice: 0,
    objectivesBound: 0,
    checkpoints: 0,
    explanationsBefore: 0,
    submitDisabledBefore: null,
    submitLabelBefore: "",
    submitLabelAfterOne: "",
    submitDisabledAfterOne: null,
    checkedAfterOne: 0,
    submitDisabledAfterAll: null,
    explanationsAfter: 0,
    correctMarks: 0,
    lockedInputs: 0,
    resultText: "",
    resultTone: "",
    wrongResultText: "",
    wrongTone: "",
    wrongScore: -1,
    wrongExplanations: 0,
    unlockedAfterWrong: -1,
    totalSteps: 0,
    poolSize: 0,
    reviewNote: document.body.textContent.includes("待人工审校"),
  };

  document.querySelector("#newQuizButton")?.click();
  await tick();

  const set = questions();
  out.seedAfter = (seed?.textContent ?? "").trim();
  out.questions = set.length;
  out.uniqueIds = new Set(set.map((question) => question.id)).size;
  out.nonChoice = set.filter((question) => question.type !== "choice").length;

  for (const section of form.querySelectorAll(".question")) {
    const objective = section.querySelector(".question-objective")?.textContent?.trim() ?? "";
    const checkpoint = section.querySelector(".question-checkpoint")?.textContent?.trim() ?? "";
    // 「绑到原文」不是指有个标题就行：右侧那串必须真的是本课 courseObjectives 里的原句。
    if (objective.startsWith("检查目标：") && objectives.includes(objective.slice("检查目标：".length))) {
      out.objectivesBound += 1;
    }
    if (checkpoint.startsWith("本题检查：") && checkpoint.length > "本题检查：".length) out.checkpoints += 1;
  }

  out.explanationsBefore = form.querySelectorAll(".explanation").length;
  out.submitDisabledBefore = submit.disabled;
  out.submitLabelBefore = submit.textContent.trim();

  const answerOne = async (question) => {
    const radio = form.querySelector('input[name="' + question.id + '"][value="' + question.answer + '"]');
    if (!radio || radio.checked) return false;
    radio.click();
    await tick();
    return true;
  };

  // 故意全选错：矩阵写的是「未通过时按学习目标汇总错题并指回本节讲解」，
  // 这句只在没考住的时候才出现，所以复习出口只能在失败那一遍上验。
  const answerWrong = async (question) => {
    const wrongIndex = (question.answer + 1) % question.options.length;
    const radio = form.querySelector('input[name="' + question.id + '"][value="' + wrongIndex + '"]');
    if (!radio) return false;
    radio.click();
    await tick();
    return true;
  };

  for (const question of set.slice(0, 1)) await answerOne(question);
  out.submitLabelAfterOne = submit.textContent.trim();
  out.submitDisabledAfterOne = submit.disabled;
  out.checkedAfterOne = form.querySelectorAll('input[type="radio"]:checked').length;

  for (const question of set.slice(1)) await answerOne(question);
  out.submitDisabledAfterAll = submit.disabled;

  submit.click();
  await tick();
  await tick();

  out.explanationsAfter = form.querySelectorAll(".explanation").length;
  out.correctMarks = form.querySelectorAll(".answer-option.is-correct").length;
  out.lockedInputs = form.querySelectorAll('input[type="radio"][disabled]').length;
  out.resultText = (result?.textContent ?? "").trim();
  out.resultTone = result?.dataset?.tone ?? "";
  out.poolSize = pool.length;

  document.querySelector("#newQuizButton")?.click();
  await tick();
  const wrongSet = questions();
  for (const question of wrongSet) await answerWrong(question);
  submit.click();
  await tick();
  await tick();

  out.wrongResultText = (result?.textContent ?? "").trim();
  out.wrongTone = result?.dataset?.tone ?? "";
  out.wrongScore = typeof quizScore === "function" ? quizScore(wrongSet) : -1;
  // 没及格也不能把已经学过的进度扣回去。
  out.unlockedAfterWrong = typeof unlockedStepCount === "function" ? unlockedStepCount() : -1;
  out.totalSteps = document.querySelectorAll("[data-step]").length;
  out.wrongExplanations = form.querySelectorAll(".explanation").length;

  return JSON.stringify(out);
})()`;
}

const readyProbe = `new Promise((resolve) => {
  const tick = () => (document.querySelector("#taskProgress") ? resolve(true) : setTimeout(tick, 100));
  tick();
})`;

const stateProbe = `JSON.stringify({
  progress: (document.querySelector("#taskProgress")?.textContent ?? "").trim(),
  unlocked: typeof unlockedStepCount === "function" ? unlockedStepCount() : -1,
})`;

let client: Cdp | null = null;
let failure: unknown = null;

try {
  await ensureDevServer();
  await ensureChrome();
  client = await Cdp.attach(cdpPort);

  for (const lesson of selectedLessons) {
    const path = `/lessons/${lesson.directory}/`;
    section(`整课推进：${lesson.directory}`);

    await client.evaluate(`try { localStorage.removeItem(${JSON.stringify(lesson.storageKey)}); } catch {} true`);
    await client.send("Page.navigate", { url: origin + path });
    await Bun.sleep(900);
    await client.evaluate(readyProbe);

    let result: any;
    try {
      result = await client.evaluateJson<any>(driver(lesson));
    } catch (error) {
      check(`${lesson.directory} 页面可以驱动到完成`, false, String(error).slice(0, 200));
      continue;
    }

    const { total, baseline, jump, solved } = result;

    check(
      `${lesson.directory} 起点是 0 / ${total} 已推进`,
      baseline.unlocked === 0 && baseline.progress === `0 / ${total} 已推进` && baseline.taskZeroHidden === false,
      `unlocked=${baseline.unlocked} progress="${baseline.progress}"`,
    );

    check(
      `${lesson.directory} 一上来点最后一步不会跳过去，并说明要先完成前一个任务`,
      jump.unlocked === 0 && jump.taskZeroHidden === false && jump.ribbon.length > 0,
      `unlocked=${jump.unlocked} ribbon="${jump.ribbon.slice(0, 40)}"`,
    );

    check(
      `${lesson.directory} 真实浏览器点击后推进到 ${total} / ${total}`,
      solved.unlocked === total && solved.progress === `${total} / ${total} 已推进`,
      `unlocked=${solved.unlocked} progress="${solved.progress}"`,
    );

    check(
      `${lesson.directory} 每一步都真的走过了，没有靠跳过凑满进度`,
      solved.unlocked === total,
      `trace=${JSON.stringify(solved.trace.map((step: any) => step.unlocked))}`,
    );

    if (solved.unlocked !== total) {
      console.log(`      诊断：${JSON.stringify(solved.trace)}`);
    }

    check(
      `${lesson.directory} 完成时给出可见的完成文案`,
      solved.ribbon.length > 0,
      `ribbon="${solved.ribbon.slice(0, 60)}"`,
    );

    const nextCourse = nextLessonOf(lesson.directory);

    check(
      `${lesson.directory} 没做完之前不把学习者提前引到下一课`,
      baseline.nextStepHidden === true,
      `hidden=${baseline.nextStepHidden}`,
    );

    if (nextCourse) {
      const nextPath = `/lessons/${lessonDirectoryName(nextCourse.id)}/index.html`;
      check(
        `${lesson.directory} 完成后可以直接进入下一课 ${nextCourse.id}`,
        solved.nextStepHidden === false &&
          solved.nextLessonTarget === nextCourse.id &&
          solved.nextLessonPath === nextPath &&
          solved.nextLessonReachable === true &&
          (solved.nextLessonText ?? "").includes(`${nextCourse.id} ${nextCourse.title}`),
        `hidden=${solved.nextStepHidden} target=${solved.nextLessonTarget} path="${solved.nextLessonPath}" 可达=${solved.nextLessonReachable}`,
      );
    } else {
      check(
        `${lesson.directory} 最后一课给出课程收尾出口，而不是指向不存在的下一课`,
        solved.nextStepHidden === false && solved.courseComplete === true && solved.nextLessonPath === null,
        `hidden=${solved.nextStepHidden} 收尾=${solved.courseComplete} nextLink=${solved.nextLessonPath}`,
      );
    }

    // 小测这一段：趁整课刚推完、小测面板可见时把卷子本身量一遍。
    let quiz: any;
    try {
      quiz = await client.evaluateJson<any>(quizDriver());
    } catch (error) {
      quiz = null;
      check(`${lesson.directory} 小测可以在页面上走完`, false, String(error).slice(0, 200));
    }

    if (quiz) {
      check(
        `${lesson.directory} 每道小测题绑到本课学习目标原文，并另起一行给出本题检查`,
        quiz.questions === 3 &&
          quiz.objectivesBound === 3 &&
          quiz.checkpoints === 3,
        `questions=${quiz.questions} bound=${quiz.objectivesBound} checkpoint=${quiz.checkpoints}`,
      );

      check(
        `${lesson.directory} 一次抽出的三道题互不重复且都是选择题`,
        quiz.uniqueIds === 3 && quiz.nonChoice === 0 && quiz.poolSize >= 3,
        `unique=${quiz.uniqueIds} nonChoice=${quiz.nonChoice} bank=${quiz.poolSize}`,
      );

      check(
        `${lesson.directory} 没答完不能提交，并说明还差几题`,
        quiz.submitDisabledBefore === true && /还差 2 题/.test(quiz.submitLabelAfterOne),
        `before=${quiz.submitLabelBefore} afterOne=${quiz.submitLabelAfterOne}`,
      );

      check(
        `${lesson.directory} 答满才放行提交`,
        quiz.submitDisabledAfterOne === true &&
          quiz.checkedAfterOne === 1 &&
          quiz.submitDisabledAfterAll === false,
        `afterOneDisabled=${quiz.submitDisabledAfterOne} checked=${quiz.checkedAfterOne} afterAllDisabled=${quiz.submitDisabledAfterAll}`,
      );

      check(
        `${lesson.directory} 提交前不给解析，提交后逐题给出解析`,
        quiz.explanationsBefore === 0 && quiz.explanationsAfter === 3,
        `before=${quiz.explanationsBefore} after=${quiz.explanationsAfter}`,
      );

      check(
        `${lesson.directory} 提交后给出得分、标出正确选项并锁定作答`,
        /本次答对 3\/3/.test(quiz.resultText) &&
          quiz.correctMarks === 3 &&
          quiz.lockedInputs === 12 &&
          quiz.resultTone !== "error",
        `result="${quiz.resultText.slice(0, 40)}" correct=${quiz.correctMarks} locked=${quiz.lockedInputs} tone=${quiz.resultTone}`,
      );

      check(
        `${lesson.directory} 没考住时按学习目标汇总错题、指回本节讲解，且不倒退进度`,
        /本次答对 0\/3/.test(quiz.wrongResultText) &&
          quiz.wrongResultText.includes("错题集中在：") &&
          quiz.wrongResultText.includes("回看这一节") &&
          quiz.wrongTone === "warn" &&
          quiz.wrongExplanations === 3 &&
          quiz.unlockedAfterWrong === quiz.totalSteps,
        `result="${quiz.wrongResultText.slice(0, 60)}" tone=${quiz.wrongTone} explanations=${quiz.wrongExplanations} unlocked=${quiz.unlockedAfterWrong}/${quiz.totalSteps}`,
      );

      check(
        `${lesson.directory} 如实写明题目待人工审校`,
        quiz.reviewNote === true,
        `reviewNote=${quiz.reviewNote}`,
      );

      check(
        `${lesson.directory} 换一套题会换试卷标识，题库本身不动`,
        /^本次试卷标识：\d+$/.test(quiz.seedBefore) &&
          /^本次试卷标识：\d+$/.test(quiz.seedAfter) &&
          quiz.seedBefore !== quiz.seedAfter,
        `${quiz.seedBefore} -> ${quiz.seedAfter}`,
      );
    }

    await client.send("Page.navigate", { url: origin + path });
    await Bun.sleep(900);
    await client.evaluate(readyProbe);
    const restored = JSON.parse(await client.evaluate<string>(stateProbe));
    check(
      `${lesson.directory} 刷新后进度仍为 ${total} / ${total}（学习进度只保存在浏览器本地）`,
      restored.unlocked === total && restored.progress === `${total} / ${total} 已推进`,
      `unlocked=${restored.unlocked} progress="${restored.progress}"`,
    );

    const stored = await client.evaluate<number>(
      `(() => {
        try {
          const raw = localStorage.getItem(${JSON.stringify(lesson.storageKey)});
          return raw ? Object.keys(JSON.parse(raw)).length : -1;
        } catch {
          return -1;
        }
      })()`,
    );
    check(
      `${lesson.directory} 进度写在本人专属的本地键里，没有提交到别处`,
      stored > 0,
      `key=${lesson.storageKey} fields=${stored}`,
    );

    await client.evaluate(`try { localStorage.removeItem(${JSON.stringify(lesson.storageKey)}); } catch {} true`);
    await client.send("Page.navigate", { url: origin + path });
    await Bun.sleep(900);
    await client.evaluate(readyProbe);
    const cleared = JSON.parse(await client.evaluate<string>(stateProbe));
    check(
      `${lesson.directory} 清掉本地存储后回到 0 / ${total}，页面不依赖任何服务端状态`,
      cleared.unlocked === 0 && cleared.progress === `0 / ${total} 已推进`,
      `unlocked=${cleared.unlocked} progress="${cleared.progress}"`,
    );
  }
} catch (error) {
  failure = error;
} finally {
  client?.close();
  for (const browser of browsers) browser.kill();
  for (const server of servers) server.kill();
  for (const directory of tempDirs) rmSync(directory, { recursive: true, force: true });
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} 项通过`);

if (failure) {
  console.error(`\n复验中断：${failure instanceof Error ? failure.message : String(failure)}`);
  process.exit(1);
}

// 声明与实跑不符时先失败，避免文档与清单里的项数悄悄过期。
const expectedTotal = selectedLessons.length * checksPerLesson;
if (checks.length !== expectedTotal) {
  console.error(
    `\n检查项数与声明不符：脚本声明每课 ${checksPerLesson} 项、本次 ${selectedLessons.length} 课应跑 ${expectedTotal} 项，实际跑了 ${checks.length} 项。` +
      `\n请同步 checksPerLesson、tests/e2e/flow-manual-checklist.md、docs/roadmap.md、docs/feature-checklist.md 与 README.md 里的数字。`,
  );
  process.exit(1);
}

if (failed.length > 0) {
  console.error("\n未通过：");
  for (const entry of failed) console.error(`- ${entry.name}  -> ${entry.detail}`);
  process.exit(1);
}

console.log("整课推进浏览器复验全部通过。");
