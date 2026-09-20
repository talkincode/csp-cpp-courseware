#!/usr/bin/env bun
/**
 * S2-01 至 S2-08 微编程输入框浏览器自动化复验（零依赖）。
 *
 * 用法：bun run e2e:s2-typed
 *
 * 脚本会自行启动开发服务器与无头 Chrome，验证这八课新加的「只读脚手架 + 一空」
 * 微编程练习：出现时机、真实键盘输入、错误指正、兜底按钮、草稿恢复与提交后解锁。
 * 它不在 `bun test` 范围内：需要真实浏览器，属于体验验收，不是单元测试。
 *
 * 可用环境变量覆盖默认值：
 *   CSP_E2E_PORT      开发服务器端口（默认 4273）
 *   CSP_E2E_CDP_PORT  无头 Chrome 的调试端口（默认 9343）
 *   CSP_E2E_CHROME    Chrome 可执行文件路径
 *   CSP_E2E_ORIGIN    复用已在运行的服务地址（设置后不自行启动服务器）
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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

type LessonConfig = {
  directory: string;
  storageKey: string;
  micro: string;
  input: string;
  check: string;
  hint: string;
  ref: string;
  reset: string;
  hintPanel: string;
  refPanel: string;
  typedField: string;
  draftField: string;
  good: string;
  fullWidth: string;
  fullWidthHint: string;
  outOfBounds: string;
  outOfBoundsMessage: string;
  blankWant: string;
  scenario: string;
};

// 八课各自的一空答案与应当出现的指正；fullWidth / outOfBounds 用来验证失败路径。
const lessons: LessonConfig[] = [
  {
    directory: "s2-01",
    storageKey: "csp-cpp-s2-01-progress-v1",
    micro: "lastIndexMicro",
    input: "lastIndexInput",
    check: "lastIndexCheckButton",
    hint: "lastIndexHintButton",
    ref: "lastIndexRefButton",
    reset: "lastIndexResetButton",
    hintPanel: "lastIndexHint",
    refPanel: "lastIndexRef",
    typedField: "lastIndexTyped",
    draftField: "lastIndexDraft",
    good: "a[n - 1]",
    fullWidth: "a［n - 1］",
    fullWidthHint: "半角",
    outOfBounds: "a[n]",
    outOfBoundsMessage: "越界",
    blankWant: "a[ 下标 ]",
    scenario: "访问最后一个成绩",
  },
  {
    directory: "s2-02",
    storageKey: "csp-cpp-s2-02-progress-v1",
    micro: "lastCharMicro",
    input: "lastCharInput",
    check: "lastCharCheckButton",
    hint: "lastCharHintButton",
    ref: "lastCharRefButton",
    reset: "lastCharResetButton",
    hintPanel: "lastCharHint",
    refPanel: "lastCharRef",
    typedField: "lastCharTyped",
    draftField: "lastCharDraft",
    good: "s[n - 1]",
    fullWidth: "s［n - 1］",
    fullWidthHint: "半角",
    outOfBounds: "s[n]",
    outOfBoundsMessage: "越界",
    blankWant: "s[ 下标 ]",
    scenario: "访问最后一个字符",
  },
  {
    directory: "s2-03",
    storageKey: "csp-cpp-s2-03-progress-v1",
    micro: "callMicro",
    input: "callInput",
    check: "callCheckButton",
    hint: "callHintButton",
    ref: "callRefButton",
    reset: "callResetButton",
    hintPanel: "callHint",
    refPanel: "callRef",
    typedField: "callTyped",
    draftField: "callDraft",
    good: "isEven(4)",
    fullWidth: "isEven（4）",
    fullWidthHint: "半角",
    outOfBounds: "isEven",
    outOfBoundsMessage: "括号",
    blankWant: "isEven(",
    scenario: "写出这次调用",
  },
  {
    directory: "s2-04",
    storageKey: "csp-cpp-s2-04-progress-v1",
    micro: "passParamMicro",
    input: "passParamInput",
    check: "passParamCheckButton",
    hint: "passParamHintButton",
    ref: "passParamRefButton",
    reset: "passParamResetButton",
    hintPanel: "passParamHint",
    refPanel: "passParamRef",
    typedField: "passParamTyped",
    draftField: "passParamDraft",
    good: "int x",
    fullWidth: "int x；",
    fullWidthHint: "半角",
    outOfBounds: "int &x",
    outOfBoundsMessage: "引用",
    blankWant: "int x",
    scenario: "写出值传递的形参",
  },
  {
    directory: "s2-05",
    storageKey: "csp-cpp-s2-05-progress-v1",
    micro: "memberMicro",
    input: "memberInput",
    check: "memberCheckButton",
    hint: "memberHintButton",
    ref: "memberRefButton",
    reset: "memberResetButton",
    hintPanel: "memberHint",
    refPanel: "memberRef",
    typedField: "memberTyped",
    draftField: "memberDraft",
    good: "a[0].score",
    fullWidth: "a[0]．score",
    fullWidthHint: "半角",
    outOfBounds: "a[0].name",
    outOfBoundsMessage: "score",
    blankWant: "a[0]",
    scenario: "写出读分数的成员访问",
  },
  {
    directory: "s2-06",
    storageKey: "csp-cpp-s2-06-progress-v1",
    micro: "swapMicro",
    input: "swapInput",
    check: "swapCheckButton",
    hint: "swapHintButton",
    ref: "swapRefButton",
    reset: "swapResetButton",
    hintPanel: "swapHint",
    refPanel: "swapRef",
    typedField: "swapTyped",
    draftField: "swapDraft",
    good: "swap(a[0], a[1])",
    fullWidth: "swap（a[0], a[1]）",
    fullWidthHint: "半角",
    outOfBounds: "swap(a[0], a[2])",
    outOfBoundsMessage: "相邻",
    blankWant: "swap(",
    scenario: "写出相邻交换",
  },
  {
    directory: "s2-07",
    storageKey: "csp-cpp-s2-07-progress-v1",
    micro: "enumMicro",
    input: "enumInput",
    check: "enumCheckButton",
    hint: "enumHintButton",
    ref: "enumRefButton",
    reset: "enumResetButton",
    hintPanel: "enumHint",
    refPanel: "enumRef",
    typedField: "enumTyped",
    draftField: "enumDraft",
    good: "if (i % 2 == 0) evenCount++;",
    fullWidth: "if（i ％ 2 == 0）evenCount＋＋；",
    fullWidthHint: "半角",
    outOfBounds: "evenCount++;",
    outOfBoundsMessage: "漏分支",
    blankWant: "if (",
    scenario: "写出遇到偶数时的判断与更新",
  },
  {
    directory: "s2-08",
    storageKey: "csp-cpp-s2-08-progress-v1",
    micro: "opsMicro",
    input: "opsInput",
    check: "opsCheckButton",
    hint: "opsHintButton",
    ref: "opsRefButton",
    reset: "opsResetButton",
    hintPanel: "opsHint",
    refPanel: "opsRef",
    typedField: "opsTyped",
    draftField: "opsDraft",
    good: "n * n",
    fullWidth: "n ＊ n",
    fullWidthHint: "半角",
    outOfBounds: "n + n",
    outOfBoundsMessage: "相乘",
    blankWant: "n *",
    scenario: "写出双层循环的次数算式",
  },
];

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

const selector = (id: string) => `#${id}`;

async function clearInput(client: Cdp, target: string) {
  await client.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector(target))});
    el.focus();
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
}

// 逐字符走真实键盘事件，验证孩子真的敲键盘时输入框与状态都跟得上。
async function typeText(client: Cdp, target: string, text: string) {
  await client.evaluate(`document.querySelector(${JSON.stringify(selector(target))}).focus(); true`);
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
    const el = document.querySelector(${JSON.stringify(selector(target))});
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
    const micro = document.querySelector(${JSON.stringify(selector(lesson.micro))});
    const input = document.querySelector(${JSON.stringify(selector(lesson.input))});
    const hintPanel = document.querySelector(${JSON.stringify(selector(lesson.hintPanel))});
    const refPanel = document.querySelector(${JSON.stringify(selector(lesson.refPanel))});
    const ribbon = document.querySelector("#completionRibbon");
    return JSON.stringify({
      microHidden: micro ? micro.hidden : null,
      inputValue: input ? input.value : null,
      inputCorrect: input ? input.classList.contains("is-correct") : null,
      inputWrong: input ? input.classList.contains("is-wrong") : null,
      feedback: hintPanel ? hintPanel.textContent : null,
      feedbackTone: hintPanel ? hintPanel.dataset.tone ?? "" : null,
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

  for (const lesson of lessons) {
    section(`E2E-${lesson.directory} 微编程：${lesson.scenario}`);

    await client.send("Page.navigate", { url: `${origin}/lessons/${lesson.directory}/` });
    await Bun.sleep(1200);
    await client.evaluate(lessonReady);
    await client.evaluate(`try { localStorage.clear(); } catch {} true`);
    await client.send("Page.reload");
    await Bun.sleep(1200);
    await client.evaluate(lessonReady);

    // 任务 1：两处选择都选对，任务 2 才会点亮
    await client.evaluate(`(() => {
      document.querySelector('[data-quantity="passFail"] [data-choice="compare"]').click();
      document.querySelector('[data-quantity="grade"] [data-choice="three-way"]').click();
      return true;
    })()`);

    const scaffold = await client.evaluateJson<any>(`(() => {
      const input = document.querySelector(${JSON.stringify(selector(lesson.input))});
      const micro = document.querySelector(${JSON.stringify(selector(lesson.micro))});
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

    const scaffoldLines = await client.evaluate(`document.querySelectorAll(${JSON.stringify(
      `#${lesson.micro} .code-sheet li`,
    )}).length`);

    check(`${lesson.directory} 脚手架为只读且只留一空`, scaffoldLines >= 3, `代码行数=${scaffoldLines}`);

    // 任务 2：走完三格之前不能出现输入框
    await click(client, "divideButton");
    await click(client, "remainderButton");
    const before = await microSnapshot(client, lesson);
    check(`${lesson.directory} 走完前两步时输入框仍隐藏`, before.microHidden === true, `hidden=${before.microHidden}`);

    await click(client, "evenButton");
    const opened = await microSnapshot(client, lesson);
    check(`${lesson.directory} 走完第三步后输入框出现`, opened.microHidden === false, `hidden=${opened.microHidden}`);

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
        fullWidth.inputWrong === true &&
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
      `feedback=${String(semantic.feedback).slice(0, 80)}`,
    );

    // 提示按钮：卡壳时有渐进线索
    await click(client, lesson.hint);
    const hint = await microSnapshot(client, lesson);
    check(`${lesson.directory} 查看提示给出渐进线索`, Boolean(hint.feedback), `hint=${String(hint.feedback).slice(0, 60)}`);

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

    // 重置：清空这一空与草稿
    await click(client, lesson.reset);
    const reset = await microSnapshot(client, lesson);
    const resetState = await readStorage(client, lesson.storageKey);
    check(
      `${lesson.directory} 重置会清空输入框与草稿`,
      reset.inputValue === "" && resetState[lesson.draftField] === "" && reset.refHidden === true,
      `value=${String(reset.inputValue)} draft=${String(resetState[lesson.draftField])}`,
    );

    // 安全边界：这一空只做字符串比较，原样保留、绝不当 HTML 解析（此时任务 1 面板仍可见，输入框可用）
    const injectedRaw = "<script>x</script>";
    await clearInput(client, lesson.input);
    await typeText(client, lesson.input, injectedRaw);
    await click(client, lesson.check);
    const injected = await microSnapshot(client, lesson);
    const injectedState = await readStorage(client, lesson.storageKey);
    const parsedNodes = await client.evaluateJson<number>(
      `document.querySelectorAll(${JSON.stringify(`${selector(lesson.micro)} script`)}).length`,
    );
    check(
      `${lesson.directory} 输入框内容原样保留，不会被当成 HTML 或正确答案`,
      parsedNodes === 0 &&
        injected.inputValue === injectedRaw &&
        injectedState[lesson.typedField] !== true &&
        injectedState.activeStep === 1,
      `raw=${String(injected.inputValue)} parsedNodes=${parsedNodes} typed=${String(injectedState[lesson.typedField])}`,
    );

    // 正确作答：解锁任务 3 并给出奖励反馈
    await clearInput(client, lesson.input);
    await typeText(client, lesson.input, lesson.good);
    await click(client, lesson.check);
    const solved = await microSnapshot(client, lesson);
    const solvedState = await readStorage(client, lesson.storageKey);
    check(
      `${lesson.directory} 正确作答后标记完成、进入任务 3 并给出反馈`,
      solved.inputCorrect === true &&
        solvedState[lesson.typedField] === true &&
        solvedState.activeStep >= 2 &&
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
      restored.inputValue === lesson.good && restored.inputCorrect === true,
      `value=${String(restored.inputValue)}`,
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
if (failure) console.error(`脚本失败：${failure instanceof Error ? failure.message : String(failure)}`);
if (failure || failed.length > 0) process.exit(1);
console.log("微编程浏览器复验全部通过。");
