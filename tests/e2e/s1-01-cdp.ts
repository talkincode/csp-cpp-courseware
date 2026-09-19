#!/usr/bin/env bun
/**
 * S1-01 浏览器自动化复验（零依赖）。
 *
 * 用法：bun run e2e:s1-01
 *
 * 脚本会自行启动开发服务器与无头 Chrome，按 tests/e2e/s1-01-manual-checklist.md
 * 的场景逐个验证，结束后清理自己启动的进程与临时目录。
 * 它不在 `bun test` 范围内：需要真实浏览器，属于体验验收，不是单元测试。
 *
 * 可用环境变量覆盖默认值：
 *   CSP_E2E_PORT      开发服务器端口（默认 4173）
 *   CSP_E2E_CDP_PORT  无头 Chrome 的调试端口（默认 9333）
 *   CSP_E2E_CHROME    Chrome 可执行文件路径
 *   CSP_E2E_ORIGIN    复用已在运行的服务地址（设置后不自行启动服务器）
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const projectRoot = `${import.meta.dir}/../..`;
const lessonFile = `${projectRoot}/lessons/s1-01/index.html`;
const lessonPath = "/lessons/s1-01/";

const port = Number(Bun.env.CSP_E2E_PORT ?? 4173);
const cdpPort = Number(Bun.env.CSP_E2E_CDP_PORT ?? 9333);
const origin = Bun.env.CSP_E2E_ORIGIN ?? `http://localhost:${port}`;
const chromeCandidates = [
  Bun.env.CSP_E2E_CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter((value): value is string => typeof value === "string" && value.length > 0);

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];

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

const chromeLog: string[] = [];

function collect(stream: ReadableStream<Uint8Array> | undefined) {
  if (!stream) return;
  void (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      for (const line of decoder.decode(chunk).split("\n")) {
        if (line.trim()) chromeLog.push(line.trim());
      }
      if (chromeLog.length > 200) chromeLog.splice(0, chromeLog.length - 200);
    }
  })();
}

const servers: Bun.Subprocess[] = [];
const browsers: Bun.Subprocess[] = [];
const tempDirs: string[] = [];

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

  const profileDir = mkdtempSync(join(tmpdir(), "csp-e2e-profile-"));
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

  static async attach(port: number) {
    const targets = (await (await fetch(`http://localhost:${port}/json/list`)).json()) as any[];
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

async function visit(client: Cdp, activeStep?: number) {
  if (activeStep !== undefined) {
    await client.evaluate(`(() => {
      try {
        const key = "csp-cpp-s1-01-progress-v1";
        const stored = JSON.parse(localStorage.getItem(key) ?? "{}");
        stored.activeStep = ${activeStep};
        localStorage.setItem(key, JSON.stringify(stored));
      } catch {}
      return true;
    })()`);
  }
  await client.send("Page.navigate", { url: origin + lessonPath });
  await Bun.sleep(1400);
  await client.evaluate(lessonReady);
}

const originalLessonHtml = readFileSync(lessonFile, "utf8");
const poolPattern = /const questionPool = (\[[\s\S]*?\n {6}\]);/;

let client: Cdp | null = null;
let failure: unknown = null;

try {
  await ensureDevServer();
  await ensureChrome();
  client = await Cdp.attach(cdpPort);

  await client.evaluate(`try { localStorage.clear(); } catch {} true`);
  await visit(client);

  section("E2E-S1-01-01 引导任务推进（任务 1 / 任务 2）");
  const tasks = await client.evaluateJson<any>(`(() => {
    const out = {};
    const ribbon = () => document.querySelector("#completionRibbon").textContent.trim();
    const panels = () => [...document.querySelectorAll(".step-panel")].map((panel) => !panel.hidden);
    out.startPanel = panels();
    document.querySelector("#compileButton").click();
    out.outOfOrderCompile = ribbon();
    document.querySelector("#runButton").click();
    out.outOfOrderRun = ribbon();
    document.querySelector("#inspectSourceButton").click();
    out.afterInspect = document.querySelector("#sourceFeedback").textContent.trim();
    out.mainLineClass = document.querySelector("#mainLine").className;
    document.querySelector("#saveSourceButton").click();
    out.afterSave = ribbon();
    document.querySelector("#compileButton").click();
    out.afterCompile = ribbon();
    document.querySelector("#runButton").click();
    out.afterRun = ribbon();
    out.terminalText = document.querySelector("#terminal").textContent.trim();
    out.panelAfterRun = panels();
    return JSON.stringify(out);
  })()`);

  check("初始只点亮任务 1 面板", JSON.stringify(tasks.startPanel) === JSON.stringify([true, false, false, false]), JSON.stringify(tasks.startPanel));
  check("跳过写入直接编译会解释缺少哪一步", tasks.outOfOrderCompile.includes("先写入"), tasks.outOfOrderCompile);
  check("跳过编译直接运行会解释缺少哪一步", tasks.outOfOrderRun.includes("先完成编译"), tasks.outOfOrderRun);
  check("点亮 main 入口有可见反馈", tasks.afterInspect.includes("找到了") && tasks.mainLineClass.includes("focus-line"), `${tasks.afterInspect.slice(0, 30)} | ${tasks.mainLineClass}`);
  check("写入源文件有即时反馈", tasks.afterSave.includes("hello.cpp 已写入"), tasks.afterSave);
  check("编译有即时反馈", tasks.afterCompile.includes("编译成功"), tasks.afterCompile);
  check("运行后终端显示 Hello, CSP!", tasks.terminalText.includes("Hello, CSP!"), tasks.terminalText.split("\n").slice(-2).join(" / "));
  check("完成奖励反馈不冒充竞赛成绩", tasks.afterRun.includes("任务 2 完成") && !/竞赛|排名|段位|认证|排行榜/.test(tasks.afterRun), tasks.afterRun);
  check("任务完成后点亮下一任务", JSON.stringify(tasks.panelAfterRun) === JSON.stringify([false, false, true, false]), JSON.stringify(tasks.panelAfterRun));

  section("E2E-S1-01-01 分号排错");
  const debug = await client.evaluateJson<any>(`(() => {
    const out = {};
    const ribbon = () => document.querySelector("#completionRibbon").textContent.trim();
    const wrong = document.querySelector('[data-fix="cin"]');
    out.wrongVisible = !wrong.closest(".step-panel").hidden;
    wrong.click();
    out.wrongFeedback = document.querySelector("#debugFeedback").textContent.trim();
    out.wrongTone = document.querySelector("#debugFeedback").dataset.tone || "";
    out.wrongRibbon = ribbon();
    const right = document.querySelector('[data-fix="semicolon"]');
    right.click();
    out.rightFeedback = document.querySelector("#debugFeedback").textContent.trim();
    out.rightClass = right.className;
    out.rightRibbon = ribbon();
    out.panelAfterFix = [...document.querySelectorAll(".step-panel")].map((panel) => !panel.hidden);
    out.soundToggle = !!document.querySelector("#soundToggle");
    return JSON.stringify(out);
  })()`);

  check("排错任务在任务 2 完成后点亮", debug.wrongVisible === true, "");
  check("错误选项解释为什么不能修复", debug.wrongFeedback.includes("不会修复") && debug.wrongTone === "error", debug.wrongFeedback.slice(0, 50));
  check("错误选项同时向辅助技术播报", debug.wrongRibbon.includes("红色标记的输出行"), debug.wrongRibbon);
  check("正确选项给出修复结论并标记正确", debug.rightFeedback.includes("修好了") && debug.rightClass.includes("is-correct"), debug.rightFeedback.slice(0, 40));
  check("完成奖励反馈不冒充竞赛成绩", debug.rightRibbon.includes("任务 3 完成") && !/竞赛|排名|段位|认证|排行榜/.test(debug.rightRibbon), debug.rightRibbon);
  check("音效有独立开关", debug.soundToggle === true, "");
  check("修好后点亮随机小测面板", JSON.stringify(debug.panelAfterFix) === JSON.stringify([false, false, false, true]), JSON.stringify(debug.panelAfterFix));

  section("E2E-S1-01-02 随机小测与解析");
  const quiz = await client.evaluateJson<any>(`(() => {
    const out = {};
    const questions = () => [...document.querySelectorAll("#quizForm section.question")];
    const submit = () => document.querySelector("#submitQuizButton");
    out.panelVisible = !document.querySelector("#quizForm").closest(".step-panel").hidden;
    out.questions = questions().length;
    out.optionsPerQuestion = questions().map((question) => question.querySelectorAll(".answer-option").length);
    out.objectives = questions().map((question) => (question.querySelector(".question-objective") || {}).textContent || "");
    out.levelChips = [...document.querySelectorAll(".level-legend .level-chip")].map((chip) => chip.textContent.trim());
    out.tiers = ["必会", "建议掌握", "拓展"].map((word) => document.body.textContent.includes(word));
    out.seed1 = document.querySelector("#quizSeed").textContent.trim();
    out.submitLabelBefore = submit().textContent.trim();
    out.submitDisabledBefore = submit().disabled;
    out.explanationsBefore = document.querySelectorAll("#quizForm .explanation").length;
    const answerOne = (index) => questions()[index].querySelectorAll("input[type=radio]")[1].click();
    answerOne(0);
    out.submitLabelAfterOne = submit().textContent.trim();
    out.checkedAfterOne = document.querySelectorAll("#quizForm input:checked").length;
    answerOne(1);
    answerOne(2);
    out.submitDisabledAfterAll = submit().disabled;
    submit().click();
    out.resultText = document.querySelector("#quizResult").textContent.trim();
    out.explanationsAfter = document.querySelectorAll("#quizForm .explanation").length;
    out.correctMarks = document.querySelectorAll("#quizForm .is-correct").length;
    out.incorrectMarks = document.querySelectorAll("#quizForm .is-incorrect").length;
    out.lockedInputs = [...document.querySelectorAll("#quizForm input[type=radio]")].filter((input) => input.disabled).length;
    out.reviewExit = !!document.querySelector("#newQuizButton");
    out.reading = document.body.textContent.includes("每次从本课题库抽出三道不同的选择题");
    out.reviewNote = document.body.textContent.includes("待人工审校");
    document.querySelector("#newQuizButton").click();
    out.seed2 = document.querySelector("#quizSeed").textContent.trim();
    out.answersAfterNewPaper = document.querySelectorAll("#quizForm input:checked").length;
    out.resultAfterNewPaper = document.querySelector("#quizResult").textContent.trim();
    out.submitLabelAfterNewPaper = submit().textContent.trim();
    return JSON.stringify(out);
  })()`);

  check("小测面板可见且显示本次试卷标识", quiz.panelVisible === true && /本次试卷标识：\d+/.test(quiz.seed1), quiz.seed1);
  check("抽出 3 道题且全部为选择题", quiz.questions === 3, `共 ${quiz.questions} 道，非选择题 0 道`);
  check("每题 4 个选项", quiz.optionsPerQuestion.every((count: number) => count === 4), JSON.stringify(quiz.optionsPerQuestion));
  check("每题标注检查目标", quiz.objectives.every((text: string) => text.includes("检查目标")), quiz.objectives[0] ?? "");
  check("页面用图例区分必会/建议掌握/拓展", quiz.levelChips.length === 3, JSON.stringify(quiz.levelChips.map((chip: string) => chip.slice(0, 8))));
  check("正文与讲解也区分三档内容", quiz.tiers.every(Boolean), JSON.stringify(quiz.tiers));
  check("未答完不可提交并提示还差几题", quiz.submitDisabledBefore === true && quiz.submitLabelBefore.includes("还差"), `${quiz.submitLabelBefore} disabled=${quiz.submitDisabledBefore}`);
  check("逐题作答有即时反馈", quiz.submitLabelAfterOne.includes("还差 2 题") && quiz.checkedAfterOne === 1, `${quiz.submitLabelAfterOne} checked=${quiz.checkedAfterOne}`);
  check("答满后可提交", quiz.submitDisabledAfterAll === false, `disabled=${quiz.submitDisabledAfterAll}`);
  check("提交前不显示解析", quiz.explanationsBefore === 0, "");
  check("提交后给出得分", /本次答对 \d\/3/.test(quiz.resultText), quiz.resultText);
  check("提交后逐题解析", quiz.explanationsAfter === 3, `解析 ${quiz.explanationsAfter} 条`);
  check("提交后标注正确与错误选项", quiz.correctMarks === 3 && quiz.incorrectMarks >= 1, `正确 ${quiz.correctMarks} 错误 ${quiz.incorrectMarks}`);
  check("提交后锁定作答不可改动", quiz.lockedInputs === 12, `锁定 ${quiz.lockedInputs} 个选项`);
  check("提供复习出口并可换一套题", quiz.reviewExit === true, "");
  check("页面说明抽题方式并标明题目待人工审校", quiz.reading === true && quiz.reviewNote === true, "");
  check("换一套题后试卷标识变化", quiz.seed2 !== quiz.seed1 && /本次试卷标识：\d+/.test(quiz.seed2), `${quiz.seed1} -> ${quiz.seed2}`);
  check("换一套题重置作答与结果", quiz.answersAfterNewPaper === 0 && quiz.resultAfterNewPaper === "" && quiz.submitLabelAfterNewPaper.includes("还差"), `已选 ${quiz.answersAfterNewPaper} 题`);

  section("E2E-S1-01-04 常见问题解惑");
  const faq = await client.evaluateJson<any>(`(async () => {
    const out = {};
    const term = document.querySelector('[data-faq="main"]');
    out.termFound = !!term;
    term.click();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const shell = document.querySelector(".faq-shell") || document.body;
    const text = shell.innerText || "";
    out.panelText = text.slice(0, 160);
    out.hasSummary = text.includes("入口函数") || text.includes("程序开始干活的地方");
    out.hasRemember = text.includes("现在记住");
    out.closeButton = !!shell.querySelector("button");
    const links = [...shell.querySelectorAll('a[href^="https://"]')];
    out.links = links.map((link) => link.getAttribute("href"));
    out.targets = links.map((link) => link.getAttribute("target"));
    return JSON.stringify(out);
  })()`);

  check("词条可点开", faq.termFound === true, "");
  check("出现初学者能懂的基础解释", faq.hasSummary === true, faq.panelText.replace(/\n+/g, " | ").slice(0, 80));
  check("包含「现在记住」一句", faq.hasRemember === true, "");
  check("外链为 https 且新标签打开", faq.links.length > 0 && faq.links.every((href: string) => href.startsWith("https://")) && faq.targets.every((target: string) => target === "_blank"), JSON.stringify(faq.links));
  check("面板提供关闭入口", faq.closeButton === true, "");

  section("E2E-S1-01-03 刷新恢复（存储可用）");
  await visit(client);
  const restored = await client.evaluateJson<any>(`(() => {
    const notice = document.querySelector("#storageNotice");
    return JSON.stringify({
      seed: document.querySelector("#quizSeed").textContent.trim(),
      mainLineClass: document.querySelector("#mainLine").className,
      terminalText: document.querySelector("#terminal").textContent.trim(),
      storageKeys: Object.keys(localStorage),
      noticeHidden: notice.hidden,
      panel: [...document.querySelectorAll(".step-panel")].map((item) => !item.hidden),
    });
  })()`);

  check("刷新后恢复试卷标识", /本次试卷标识：\d+/.test(restored.seed), restored.seed);
  check("刷新后恢复任务进度", restored.terminalText.includes("Hello, CSP!") && restored.mainLineClass.includes("focus-line"), restored.mainLineClass);
  check("刷新后恢复到已解锁面板", JSON.stringify(restored.panel) === JSON.stringify([false, false, false, true]), JSON.stringify(restored.panel));
  check("进度只写入本课浏览器本地键", restored.storageKeys.length === 1 && restored.storageKeys[0].includes("csp-cpp-s1-01-progress-v1"), JSON.stringify(restored.storageKeys));
  check("存储可用时不显示降级提示", restored.noticeHidden === true, `hidden=${restored.noticeHidden}`);

  section("E2E-S1-01-03 存储不可用降级");
  const injection = await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const blocked = () => { throw new DOMException("blocked for e2e", "SecurityError"); };
      Storage.prototype.getItem = blocked;
      Storage.prototype.setItem = blocked;
      Storage.prototype.removeItem = blocked;
    })();`,
  });
  await visit(client);
  const degraded = await client.evaluateJson<any>(`(() => {
    const notice = document.querySelector("#storageNotice");
    const out = {
      noticeHidden: notice.hidden,
      noticeText: notice.textContent.trim(),
      terminalText: document.querySelector("#terminal").textContent.trim(),
      panel: [...document.querySelectorAll(".step-panel")].map((item) => !item.hidden),
    };
    document.querySelector("#inspectSourceButton").click();
    out.feedback = document.querySelector("#sourceFeedback").textContent.trim();
    out.questions = document.querySelectorAll("#quizForm section.question").length;
    return JSON.stringify(out);
  })()`);
  await client.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: injection.result.identifier });

  check("存储不可用时给出明确提示", degraded.noticeHidden === false && degraded.noticeText.includes("刷新页面后不会恢复进度"), degraded.noticeText.slice(0, 50));
  check("提示说明当前会话仍可继续", degraded.noticeText.includes("仍可继续"), "");
  check("存储不可用时不崩溃且互动继续可用", degraded.feedback.includes("找到了") && degraded.questions === 3, `反馈：${degraded.feedback.slice(0, 18)}；题目 ${degraded.questions} 道`);
  check("存储不可用时不伪造已保存", !degraded.terminalText.includes("Hello, CSP!"), degraded.terminalText.slice(-24));
  check("存储不可用时不自称已恢复进度", JSON.stringify(degraded.panel) === JSON.stringify([true, false, false, false]), JSON.stringify(degraded.panel));

  section("E2E-S1-01-05 题库异常降级");
  async function probeBrokenPool() {
    await visit(client!, 3);
    return client!.evaluateJson<any>(`(() => {
      const out = {};
      out.questions = document.querySelectorAll("#quizForm section.question").length;
      out.formText = document.querySelector("#quizForm").textContent.trim();
      out.resultText = document.querySelector("#quizResult").textContent.trim();
      out.submitDisabled = document.querySelector("#submitQuizButton").disabled;
      out.panelVisible = !document.querySelector("#quizForm").closest(".step-panel").hidden;
      out.pageUsable = !!document.querySelector("#inspectSourceButton");
      return JSON.stringify(out);
    })()`);
  }

  try {
    writeFileSync(lessonFile, originalLessonHtml.replace(poolPattern, "const questionPool = [];"));
    const empty = await probeBrokenPool();
    check("空题库时小测面板仍可见", empty.panelVisible === true, "");
    check("空题库不渲染题目", empty.questions === 0, `题目 ${empty.questions} 道`);
    check("空题库说明题库不可用", empty.formText.includes("题库暂时不可用或题目无效"), empty.formText.slice(0, 40));
    check("空题库提示无法组卷并保留进度", empty.resultText.includes("无法组卷") && empty.resultText.includes("进度没有丢失"), empty.resultText);
    check("空题库时提交按钮不可点击", empty.submitDisabled === true, "");
    check("空题库不显示伪造的分数", !/\d+\s*\/\s*3/.test(`${empty.formText}${empty.resultText}`), "");
    check("空题库时页面其余部分仍可用", empty.pageUsable === true, "");

    const poolLiteral = originalLessonHtml.match(poolPattern)![1];
    const brokenPool = poolLiteral.replace(/answer: \d+/g, "answer: 99");
    check("越界答案临时改动已生效", brokenPool !== poolLiteral, "");
    writeFileSync(lessonFile, originalLessonHtml.replace(poolPattern, `const questionPool = ${brokenPool};`));
    const outOfRange = await probeBrokenPool();
    check("答案越界时不渲染无法判分的试卷", outOfRange.questions === 0, `题目 ${outOfRange.questions} 道`);
    check("答案越界时说明题目无效", outOfRange.formText.includes("题库暂时不可用或题目无效"), outOfRange.formText.slice(0, 40));
    check("答案越界时提示无法组卷", outOfRange.resultText.includes("无法组卷"), outOfRange.resultText);
    check("答案越界时提交按钮不可点击", outOfRange.submitDisabled === true, "");
  } finally {
    writeFileSync(lessonFile, originalLessonHtml);
    check("临时改动已还原", readFileSync(lessonFile, "utf8") === originalLessonHtml, "");
  }
} catch (error) {
  failure = error;
} finally {
  client?.close();
  for (const browser of browsers) browser.kill();
  for (const server of servers) server.kill();
  if (tempDirs.length > 0) {
    // 等待 Chrome 真正退出后再删临时配置目录，否则可能删到一半失败。
    await Bun.sleep(600);
    for (const dir of tempDirs) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          rmSync(dir, { recursive: true, force: true });
          break;
        } catch {
          await Bun.sleep(400);
        }
      }
    }
  }
}

if (failure) {
  console.error(`\n复验中断：${failure instanceof Error ? failure.message : String(failure)}`);
  process.exit(2);
}

const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} 项浏览器检查通过`);
if (failed.length) {
  console.log(`失败项：${failed.map((item) => item.name).join(" | ")}`);
  process.exit(1);
}
console.log("S1-01 浏览器自动化复验全部通过。");
process.exit(0);
