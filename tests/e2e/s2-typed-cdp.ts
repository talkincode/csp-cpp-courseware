#!/usr/bin/env bun
/**
 * 手写填空微编程的浏览器自动化复验（零依赖）。
 *
 * 用法：bun run e2e:s1-typed（S1-02 至 S1-08）、bun run e2e:s2-typed（S2 八课）、bun run e2e:s3-typed（S3 八课）、bun run e2e:s4-typed（S4 八课）、bun run e2e:s5-typed（S5 八课）、bun run e2e:typed（全部）
 *
 * 这个脚本最早为 S2 八课而写，后来 S3、S4、S5 与 S1 的课沿用同一套课件样板，所以也一起跑；
 * 用 CSP_E2E_LESSONS=s3-01,s3-03 可以只跑指定几课。
 *
 * 脚本会自行启动开发服务器与无头 Chrome，验证「只读脚手架 + 一空」的
 * 微编程练习：出现时机、真实键盘输入、错误指正、兜底按钮、草稿恢复与提交后解锁。
 * 它不在 `bun test` 范围内：需要真实浏览器，属于体验验收，不是单元测试。
 *
 * 可用环境变量覆盖默认值：
 *   CSP_E2E_PORT      开发服务器端口（默认 4273）
 *   CSP_E2E_CDP_PORT  无头 Chrome 的调试端口（默认 9343）
 *   CSP_E2E_CHROME    Chrome 可执行文件路径
 *   CSP_E2E_ORIGIN    复用已在运行的服务地址（设置后不自行启动服务器）
 *   CSP_E2E_LESSONS   只跑指定课程，逗号分隔（如 s3-01,s3-02）
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  asSelector,
  blankIds,
  lessonFlows as lessons,
  type LessonConfig,
} from "./lesson-flows.ts";
import { join } from "node:path";

const projectRoot = `${import.meta.dir}/../..`;
const port = Number(Bun.env.CSP_E2E_PORT ?? 4273);
const cdpPort = Number(Bun.env.CSP_E2E_CDP_PORT ?? 9343);
const origin = Bun.env.CSP_E2E_ORIGIN ?? `http://localhost:${port}`;
const chromeCandidates = [
  Bun.env.CSP_E2E_CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter((value): value is string => typeof value === "string" && value.length > 0);


// 默认跑全部；CSP_E2E_LESSONS=s3-01,s3-03 可以只跑指定几课。
const requestedLessons = (Bun.env.CSP_E2E_LESSONS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
const unknownLessons = requestedLessons.filter((value) => !lessons.some((lesson) => lesson.directory === value));

if (unknownLessons.length > 0) {
  console.error(`CSP_E2E_LESSONS 里有不认识的课程：${unknownLessons.join(", ")}`);
  process.exit(1);
}

const selectedLessons =
  requestedLessons.length > 0 ? lessons.filter((lesson) => requestedLessons.includes(lesson.directory)) : lessons;

// 每课固定检查数：所有课共 16 项；有揭晓步骤的课（默认三步演示，只有 S1-03 这类显式留空）
// 再多一项「走完前 N 步时输入框仍隐藏」。脚本跑完拿这两个数字自查，声明与实跑不符就直接失败；
// 文档里的项数也绑在这里（见 tests/e2e-count-facts.test.ts）。
const checksPerLessonWithoutReveal = 16;
const revealExtraChecks = 1;
// 多数课是三步演示；S1-03 这类任务 1 选对就点亮的课 revealButtons 留空。
const defaultRevealButtons = ["divideButton", "remainderButton", "evenButton"];
const revealButtonsFor = (lesson: LessonConfig) => lesson.revealButtons ?? defaultRevealButtons;

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const servers: Bun.Subprocess[] = [];
const browsers: Bun.Subprocess[] = [];
const tempDirs: string[] = [];
const chromeLog: string[] = [];

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

  const profileDir = mkdtempSync(join(tmpdir(), "csp-e2e-s2-profile-"));
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

const lessonReady = `new Promise((resolve) => {
  const tick = () => (document.querySelector("#quizForm") ? resolve(true) : setTimeout(tick, 100));
  tick();
})`;

async function clearInput(client: Cdp, target: string) {
  await client.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(asSelector(target))});
    el.focus();
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
}

// 逐字符走真实键盘事件，验证孩子真的敲键盘时输入框与状态都跟得上。
async function typeText(client: Cdp, target: string, text: string) {
  await client.evaluate(`document.querySelector(${JSON.stringify(asSelector(target))}).focus(); true`);
  for (const character of text) {
    // keyDown 报“按下哪个键”，char 负责真正插入字符：标点没有合法的 code（如 `<`），
    // 只把 text 挂在 keyDown 上会被丢弃，必须补一个 char 事件。
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: character });
    await client.send("Input.dispatchKeyEvent", {
      type: "char",
      text: character,
      unmodifiedText: character,
    });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: character });
  }
}

async function click(client: Cdp, target: string) {
  return client.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(asSelector(target))});
    if (!el) return false;
    el.click();
    return true;
  })()`);
}

async function readStorage(client: Cdp, key: string) {
  return client.evaluateJson<any>(
    `JSON.stringify(JSON.parse(localStorage.getItem(${JSON.stringify(key)}) ?? "null") ?? {})`,
  );
}

async function microSnapshot(client: Cdp, lesson: LessonConfig) {
  return client.evaluateJson<any>(`(() => {
    const micro = document.querySelector(${JSON.stringify(asSelector(lesson.micro))});
    const blanks = ${JSON.stringify(blankIds(lesson))}.map((id) => document.querySelector("#" + id));
    const hintPanel = document.querySelector(${JSON.stringify(asSelector(lesson.hintPanel))});
    const feedbackPanel = document.querySelector(${JSON.stringify(asSelector(lesson.feedbackPanel ?? lesson.hintPanel))});
    const refPanel = document.querySelector(${JSON.stringify(asSelector(lesson.refPanel))});
    const ribbon = document.querySelector("#completionRibbon");
    // hidden 只说明自己有没有被藏起来，S1-05 的空位在整块面板被藏的时候仍然“出现”着，
    // 所以按渲染结果判断：有盒子（getClientRects）才算学习者真的看得见。
    const visible = (element) => Boolean(element) && !element.hidden && element.getClientRects().length > 0;
    return JSON.stringify({
      microVisible: visible(micro),
      inputValue: blanks[0] ? blanks[0].value : null,
      values: blanks.map((element) => (element ? element.value : null)),
      allCorrect: blanks.every((element) => Boolean(element) && element.classList.contains("is-correct")),
      anyWrong: blanks.some((element) => Boolean(element) && element.classList.contains("is-wrong")),
      feedback: feedbackPanel ? feedbackPanel.textContent : null,
      feedbackTone: feedbackPanel ? feedbackPanel.dataset.tone ?? "" : null,
      hintText: hintPanel ? hintPanel.textContent : null,
      refHidden: refPanel ? refPanel.hidden : null,
      ribbon: ribbon ? ribbon.textContent : "",
    });
  })()`);
}

let client: Cdp | null = null;
let failure: unknown = null;

try {
  await ensureDevServer();
  await ensureChrome();
  client = await Cdp.attach(cdpPort);

  for (const lesson of selectedLessons) {
    section(`E2E-${lesson.directory} 微编程：${lesson.scenario}`);

    await client.send("Page.navigate", { url: `${origin}/lessons/${lesson.directory}/` });
    await Bun.sleep(1200);
    await client.evaluate(lessonReady);
    await client.evaluate(`try { localStorage.clear(); } catch {} true`);
    await client.send("Page.reload");
    await Bun.sleep(1200);
    await client.evaluate(lessonReady);

    // 任务 1：把该点对的选择都点对（多数课两处），任务 2 才会点亮
    const initial = await microSnapshot(client, lesson);
    check(
      `${lesson.directory} 打开页面时输入框还没有出现`,
      initial.microVisible === false,
      `visible=${initial.microVisible}`,
    );

    const taskOnePicks = lesson.taskOnePicks ?? [
      '[data-quantity="passFail"] [data-choice="compare"]',
      '[data-quantity="grade"] [data-choice="three-way"]',
    ];
    await client.evaluate(`(() => {
      for (const selector of ${JSON.stringify(taskOnePicks)}) {
        const button = document.querySelector(selector);
        if (!button) throw new Error("任务 1 找不到按钮：" + selector);
        button.click();
      }
      return true;
    })()`);

    const scaffold = await client.evaluateJson<any>(`(() => {
      const input = document.querySelector(${JSON.stringify(asSelector(lesson.input))});
      const micro = document.querySelector(${JSON.stringify(asSelector(lesson.micro))});
      return JSON.stringify({
        exists: Boolean(input) && Boolean(micro),
        type: input ? input.type : null,
        font: input ? getComputedStyle(input).fontFamily : null,
        autocapitalize: input ? input.getAttribute("autocapitalize") : null,
        autocorrect: input ? input.getAttribute("autocorrect") : null,
        spellcheck: input ? input.getAttribute("spellcheck") : null,
        ariaLabel: input ? input.getAttribute("aria-label") : null,
      });
    })()`);

    check(
      `${lesson.directory} 提供了等宽输入框并带上防自动大写/纠错属性`,
      scaffold.exists &&
        scaffold.type === "text" &&
        /mono/i.test(String(scaffold.font)) &&
        scaffold.autocapitalize === "none" &&
        scaffold.autocorrect === "off" &&
        scaffold.spellcheck === "false" &&
        Boolean(scaffold.ariaLabel),
      JSON.stringify(scaffold),
    );

    const scaffoldShape = await client.evaluateJson<any>(`(() => {
      const micro = document.querySelector(${JSON.stringify(asSelector(lesson.micro))});
      const lineSelector = ${JSON.stringify(lesson.scaffoldSelector ?? ".code-sheet li")};
      return JSON.stringify({
        lines: micro ? micro.querySelectorAll(lineSelector).length : 0,
        blanks: micro ? micro.querySelectorAll("input.micro-input").length : 0,
        textareas: micro ? micro.querySelectorAll("textarea").length : 0,
      });
    })()`);

    // 行数够说明脚手架不是空壳，空位数与声明一致才说明没让孩子手打整段程序。
    check(
      `${lesson.directory} 脚手架为只读、行数与空位数都符合微编程要求`,
      scaffoldShape.lines >= (lesson.scaffoldLines ?? 2) &&
        scaffoldShape.blanks === blankIds(lesson).length &&
        scaffoldShape.textareas === 0,
      JSON.stringify(scaffoldShape),
    );

    // 任务 2：按各课真实的点亮方式走到输入框出现。
    // S1-02 是“存文件 → 编译 → 运行”；S1-05 还得先答完任务 3 才会翻到有输入框的面板。
    const revealButtons = revealButtonsFor(lesson);
    // 点亮步骤的选择器写错会静默跳过，最后只说“输入框没出现”，所以把没找到的目标记下来一起报。
    const missedReveal: string[] = [];
    for (const button of revealButtons.slice(0, -1)) {
      if (!(await click(client, button))) missedReveal.push(button);
    }
    const before = await microSnapshot(client, lesson);
    if (revealButtons.length > 0) {
      check(
        `${lesson.directory} 走完前${revealButtons.length - 1}步时输入框仍隐藏`,
        before.microVisible === false && missedReveal.length === 0,
        `visible=${before.microVisible} missed=${JSON.stringify(missedReveal)}`,
      );
      const lastReveal = revealButtons[revealButtons.length - 1]!;
      if (!(await click(client, lastReveal))) missedReveal.push(lastReveal);
    }

    const opened = await microSnapshot(client, lesson);
    const openedState = await readStorage(client, lesson.storageKey);
    check(
      revealButtons.length === 0
        ? `${lesson.directory} 任务 1 选对后输入框出现，可以亲手写`
        : `${lesson.directory} 走完第${revealButtons.length}步后输入框出现`,
      opened.microVisible === true && missedReveal.length === 0,
      `visible=${opened.microVisible} missed=${JSON.stringify(missedReveal)}`,
    );

    // 空提交：必须给出提示且不算完成
    await click(client, lesson.check);
    const blank = await microSnapshot(client, lesson);
    const blankState = await readStorage(client, lesson.storageKey);
    check(
      `${lesson.directory} 空提交给出“先敲字”的指正且不算完成`,
      Boolean(blank.feedback) && blank.feedbackTone === "error" && blankState[lesson.typedField] !== true,
      `feedback=${String(blank.feedback).slice(0, 60)}`,
    );

    // 全角符号：必须提示半角
    await clearInput(client, lesson.input);
    await typeText(client, lesson.input, lesson.fullWidth);
    const typedDraft = await readStorage(client, lesson.storageKey);
    check(
      `${lesson.directory} 真实键盘输入会写进草稿`,
      typedDraft[lesson.draftField] === lesson.fullWidth,
      `draft=${String(typedDraft[lesson.draftField])}`,
    );

    await click(client, lesson.check);
    const fullWidth = await microSnapshot(client, lesson);
    const fullWidthState = await readStorage(client, lesson.storageKey);
    check(
      `${lesson.directory} 全角符号被指正为半角且不算完成`,
      String(fullWidth.feedback).includes(lesson.fullWidthHint) &&
        fullWidth.anyWrong === true &&
        fullWidthState[lesson.typedField] !== true,
      `feedback=${String(fullWidth.feedback).slice(0, 80)}`,
    );

    // 语义错误：越界 / 缺括号必须点出原因
    await clearInput(client, lesson.input);
    await typeText(client, lesson.input, lesson.outOfBounds);
    await click(client, lesson.check);
    const semantic = await microSnapshot(client, lesson);
    const semanticState = await readStorage(client, lesson.storageKey);
    check(
      `${lesson.directory} 语义错误被点出原因（${lesson.outOfBoundsMessage}）且不算完成`,
      String(semantic.feedback).includes(lesson.outOfBoundsMessage) && semanticState[lesson.typedField] !== true,
      `feedback=${String(semantic.feedback).slice(0, 80)} draft=${JSON.stringify(String(semanticState[lesson.draftField]))}`,
    );

    // 提示按钮：卡壳时有渐进线索。同一块面板既要报错又要给提示，所以要求提示确实换了内容。
    await click(client, lesson.hint);
    const hint = await microSnapshot(client, lesson);
    check(
      `${lesson.directory} 查看提示给出渐进线索`,
      Boolean(hint.hintText) && String(hint.hintText) !== String(semantic.feedback),
      `hint=${String(hint.hintText).slice(0, 60)}`,
    );

    // 参考代码：可展开也可收起
    await click(client, lesson.ref);
    const refOpen = await microSnapshot(client, lesson);
    await click(client, lesson.ref);
    const refClosed = await microSnapshot(client, lesson);
    check(
      `${lesson.directory} 参考代码可展开可收起`,
      refOpen.refHidden === false && refClosed.refHidden === true,
      `open=${refOpen.refHidden} closed=${refClosed.refHidden}`,
    );

    // 重置：清空这一空（两空课清第一空）与草稿
    await click(client, lesson.reset);
    const reset = await microSnapshot(client, lesson);
    const resetState = await readStorage(client, lesson.storageKey);
    check(
      `${lesson.directory} 重置会清空输入框与草稿`,
      reset.inputValue === "" && resetState[lesson.draftField] === "" && reset.refHidden === true,
      `value=${String(reset.inputValue)} draft=${String(resetState[lesson.draftField])}`,
    );

    // 安全边界：这一空只做字符串比较，原样保留、绝不当 HTML 解析（此时任务 1 面板仍可见，输入框可用）
    // 有的空位带 maxlength（S1-08 补分号只留 10 个字符），注入串要挑一条放得进去的，
    // 否则测到的是被截断的输入，而不是「不会被当成 HTML」。
    const injectionRoom = await client.evaluateJson<number>(
      `document.querySelector(${JSON.stringify(asSelector(lesson.input))}).maxLength`,
    );
    const injectedRaw = injectionRoom < 0 || injectionRoom >= 12 ? "<script>x</script>" : "<b>x</b>";
    await clearInput(client, lesson.input);
    await typeText(client, lesson.input, injectedRaw);
    await click(client, lesson.check);
    const injected = await microSnapshot(client, lesson);
    const injectedState = await readStorage(client, lesson.storageKey);
    // script 与 b 都要数：带 maxlength 的空位放进 <b>x</b>，页面上出现任何解析出来的元素都是失败。
    const parsedNodes = await client.evaluateJson<number>(
      `document.querySelectorAll(${JSON.stringify(`${asSelector(lesson.micro)} script, ${asSelector(lesson.micro)} b`)}).length`,
    );
    check(
      `${lesson.directory} 输入框内容原样保留，不会被当成 HTML 或正确答案`,
      parsedNodes === 0 &&
        injected.inputValue === injectedRaw &&
        injectedState[lesson.typedField] !== true &&
        injectedState.activeStep === openedState.activeStep,
      `raw=${String(injected.inputValue)} parsedNodes=${parsedNodes} typed=${String(injectedState[lesson.typedField])}`,
    );

    // 正确作答：解锁下一任务并给出奖励反馈
    await clearInput(client, lesson.input);
    await typeText(client, lesson.input, lesson.good);
    if (lesson.secondBlank) {
      await clearInput(client, lesson.secondBlank.input);
      await typeText(client, lesson.secondBlank.input, lesson.secondBlank.good);
    }
    await click(client, lesson.check);
    const solved = await microSnapshot(client, lesson);
    const solvedState = await readStorage(client, lesson.storageKey);
    check(
      `${lesson.directory} 正确作答后标记完成、进入下一任务并给出反馈`,
      solved.allCorrect === true &&
        solvedState[lesson.typedField] === true &&
        solvedState.activeStep > openedState.activeStep &&
        String(solved.ribbon).length > 0,
      `typed=${String(solvedState[lesson.typedField])} activeStep=${String(solvedState.activeStep)}`,
    );

    // 刷新后草稿与完成状态都要恢复
    await client.send("Page.reload");
    await Bun.sleep(1200);
    await client.evaluate(lessonReady);
    const restored = await microSnapshot(client, lesson);
    check(
      `${lesson.directory} 刷新后恢复这一空的答案与完成状态`,
      restored.inputValue === lesson.good && restored.allCorrect === true,
      `value=${String(restored.inputValue)}`,
    );

    // 抽出来的题不能只丢一句自由文本：检查目标要是本课学习目标的原文，
    // 同时另起一行保留“这道题具体查什么”。模板写坏（例如渲染成 undefined）只有真渲染才看得出。
    const quizBinding = await client.evaluateJson<any>(`(() => {
      const questions = [...document.querySelectorAll("#quizForm section.question")];
      const text = (node) => (node ? node.textContent.trim() : "");
      return JSON.stringify({
        goals: typeof courseObjectives === "undefined" ? null : courseObjectives,
        objectives: questions.map((question) => text(question.querySelector(".question-objective"))),
        checkpoints: questions.map((question) => text(question.querySelector(".question-checkpoint"))),
      });
    })()`);

    check(
      `${lesson.directory} 抽出的题都把检查目标绑到本课学习目标原文`,
      Array.isArray(quizBinding.goals) &&
        quizBinding.objectives.length === 3 &&
        quizBinding.objectives.every((line: string) => quizBinding.goals.includes(line.replace("检查目标：", ""))),
      `目标 ${JSON.stringify(quizBinding.goals)} 显示 ${JSON.stringify(quizBinding.objectives[0] ?? "")}`,
    );

    check(
      `${lesson.directory} 每题都保留一句更细的本题检查说明`,
      quizBinding.checkpoints.length === 3 && quizBinding.checkpoints.every((line: string) => /^本题检查：\S/.test(line)),
      `显示 ${JSON.stringify(quizBinding.checkpoints[0] ?? "")}`,
    );
  }
} catch (error) {
  failure = error;
} finally {
  client?.close();
  for (const browser of browsers) browser.kill();
  for (const server of servers) server.kill();
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} 项通过`);

const expectedTotal = selectedLessons.reduce(
  (sum, lesson) => sum + checksPerLessonWithoutReveal + (revealButtonsFor(lesson).length > 0 ? revealExtraChecks : 0),
  0,
);
const countMismatch = checks.length !== expectedTotal;

if (failure) console.error(`脚本失败：${failure instanceof Error ? failure.message : String(failure)}`);
if (countMismatch) {
  console.error(
    `检查项数与声明不符：脚本声明每课 ${checksPerLessonWithoutReveal} 项（有揭晓步骤的课再加 ${revealExtraChecks} 项）、` +
      `本次 ${selectedLessons.length} 课应跑 ${expectedTotal} 项，实际跑了 ${checks.length} 项。` +
      `\n请同步 checksPerLessonWithoutReveal、tests/e2e/manual-checklist.md、docs/roadmap.md 与 README.md 里的数字。`,
  );
}
if (failure || failed.length > 0) process.exit(1);
if (countMismatch) process.exit(3);
console.log("微编程浏览器复验全部通过。");
