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

// 八个场景固定 88 项；跑完拿这个数字自查，声明与实跑不符就直接失败；
// 文档里的项数也绑在这里（见 tests/e2e-count-facts.test.ts）。
const expectedChecks = 88;

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
    out.choiceFeedback = document.querySelector("#debugFeedback").textContent.trim();
    out.choiceClass = right.className;
    out.microVisible = !document.querySelector("#fixMicro").hidden;
    const input = document.querySelector("#fixInput");
    input.value = ";";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#fixCheckButton").click();
    out.rightFeedback = document.querySelector("#debugFeedback").textContent.trim();
    out.rightRibbon = ribbon();
    out.panelAfterFix = [...document.querySelectorAll(".step-panel")].map((panel) => !panel.hidden);
    out.soundToggle = !!document.querySelector("#soundToggle");
    return JSON.stringify(out);
  })()`);

  check("排错任务在任务 2 完成后点亮", debug.wrongVisible === true, "");
  check("错误选项解释为什么不能修复", debug.wrongFeedback.includes("不会修复") && debug.wrongTone === "error", debug.wrongFeedback.slice(0, 50));
  check("错误选项同时向辅助技术播报", debug.wrongRibbon.includes("红色标记的输出行"), debug.wrongRibbon);
  check("正确选项先肯定选择并露出亲手输入", debug.choiceFeedback.includes("选对了") && debug.choiceClass.includes("is-correct") && debug.microVisible === true, debug.choiceFeedback.slice(0, 40));
  check("亲手补分号后给出修复结论", debug.rightFeedback.includes("修好了"), debug.rightFeedback.slice(0, 40));
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
    out.checkpoints = questions().map((question) => (question.querySelector(".question-checkpoint") || {}).textContent || "");
    out.goals = typeof courseObjectives === "undefined" ? null : courseObjectives;
    out.levelChips = [...document.querySelectorAll(".level-legend .level-chip")].map((chip) => chip.textContent.trim());
    out.tiers = ["必会", "建议掌握", "拓展"].map((word) => document.body.textContent.includes(word));
    out.seed1 = document.querySelector("#quizSeed").textContent.trim();
    out.submitLabelBefore = submit().textContent.trim();
    out.submitDisabledBefore = submit().disabled;
    out.explanationsBefore = document.querySelectorAll("#quizForm .explanation").length;
    out.reviewExitHiddenBefore = document.querySelector("#quizReviewExit").hidden;
    // 题库的正确答案位置是打乱过的，不能假设「第 2 个选项一定错」：按页面自己的
    // questionPool 算出每题的错误下标再点。
    const answerWrong = (index) => {
      const radios = [...questions()[index].querySelectorAll("input[type=radio]")];
      const pool = typeof questionPool === "undefined" ? [] : questionPool;
      const question = pool.find((item) => item.id === radios[0].name);
      const wrongIndex = ((question ? question.answer : 0) + 1) % radios.length;
      radios[wrongIndex].click();
    };
    answerWrong(0);
    out.submitLabelAfterOne = submit().textContent.trim();
    out.checkedAfterOne = document.querySelectorAll("#quizForm input:checked").length;
    answerWrong(1);
    answerWrong(2);
    out.submitDisabledAfterAll = submit().disabled;
    submit().click();
    out.resultText = document.querySelector("#quizResult").textContent.trim();
    out.explanationsAfter = document.querySelectorAll("#quizForm .explanation").length;
    out.correctMarks = document.querySelectorAll("#quizForm .is-correct").length;
    out.incorrectMarks = document.querySelectorAll("#quizForm .is-incorrect").length;
    out.lockedInputs = [...document.querySelectorAll("#quizForm input[type=radio]")].filter((input) => input.disabled).length;
    // 复习出口：错题不能只回一句“回看这一节对应的讲解”，必须能一步点回讲这条目标的任务。
    const exit = document.querySelector("#quizReviewExit");
    out.reviewExitHiddenAfter = exit.hidden;
    out.reviewExitLabel = (exit.querySelector("p") || {}).textContent || "";
    const exitButtons = [...exit.querySelectorAll("[data-review-step]")];
    out.reviewExitSteps = exitButtons.map((button) => Number(button.dataset.reviewStep));
    out.reviewExitTexts = exitButtons.map((button) => button.textContent.trim());
    out.reviewExitNative = exitButtons.every((button) => button.tagName === "BUTTON" && button.type === "button");
    // 错题对应的任务由页面自己的 objectiveReviewStep 决定：这里按每题显示的“检查目标”
    // 原文反查它在 courseObjectives 里的下标，再查表去重，核对出口用的就是这张表。
    const goals = typeof courseObjectives === "undefined" ? [] : courseObjectives;
    const missedSteps = [];
    for (const question of questions()) {
      const label = (question.querySelector(".question-objective") || {}).textContent || "";
      const objectiveIndex = goals.indexOf(label.replace("检查目标：", ""));
      const step = objectiveReviewStep[objectiveIndex];
      if (!missedSteps.includes(step)) missedSteps.push(step);
    }
    out.reviewExitExpectedSteps = missedSteps;
    // 点第一个出口：必须真的切到那个任务面板，并把焦点交给它的标题。
    const before = [...document.querySelectorAll(".step-panel")].map((panel) => !panel.hidden);
    exitButtons[0].click();
    const after = [...document.querySelectorAll(".step-panel")].map((panel) => !panel.hidden);
    const targetStep = Number(exitButtons[0].dataset.reviewStep);
    out.reviewExitPanelsBefore = before;
    out.reviewExitPanelsAfter = after;
    out.reviewExitTargetStep = targetStep;
    out.reviewExitFocusTag = document.activeElement.tagName;
    out.reviewExitFocusText = (document.activeElement.textContent || "").trim().slice(0, 30);
    out.reviewExitTargetHeading = (document.querySelector('[data-panel="' + targetStep + '"] h2') || {}).textContent || "";
    out.reviewExitRibbon = document.querySelector("#completionRibbon").textContent.trim();
    out.quizSubmittedStillLocked = document.querySelectorAll("#quizForm input[type=radio]:disabled").length;
    // 学习者看完讲解会回到小测；这一步也让后面的刷新恢复有确定的落点。
    document.querySelector('.step-button[data-step="3"]').click();
    out.reviewExitBackToQuiz = [...document.querySelectorAll(".step-panel")].map((panel) => !panel.hidden)[3] === true;
    out.reading = document.body.textContent.includes("每次从本课题库抽出三道不同的选择题");
    out.reviewNote = document.body.textContent.includes("已通过校验");
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
  // 检查目标不能是题库里随手写的一句自由文本：它要能在页面上对上本课 courseData 的学习目标原文。
  check(
    "检查目标就是本课学习目标原文",
    Array.isArray(quiz.goals) &&
      quiz.goals.length === 3 &&
      quiz.objectives.every((line: string) => quiz.goals.includes(line.replace("检查目标：", ""))),
    `目标 ${JSON.stringify(quiz.goals)} 显示 ${JSON.stringify(quiz.objectives[0] ?? "")}`,
  );
  check(
    "每题另起一行写出更细的本题检查",
    quiz.checkpoints.every((line: string) => /^本题检查：\S/.test(line)),
    quiz.checkpoints[0] ?? "",
  );
  check("页面用图例区分必会/建议掌握/拓展", quiz.levelChips.length === 3, JSON.stringify(quiz.levelChips.map((chip: string) => chip.slice(0, 8))));
  check("正文与讲解也区分三档内容", quiz.tiers.every(Boolean), JSON.stringify(quiz.tiers));
  check("未答完不可提交并提示还差几题", quiz.submitDisabledBefore === true && quiz.submitLabelBefore.includes("还差"), `${quiz.submitLabelBefore} disabled=${quiz.submitDisabledBefore}`);
  check("逐题作答有即时反馈", quiz.submitLabelAfterOne.includes("还差 2 题") && quiz.checkedAfterOne === 1, `${quiz.submitLabelAfterOne} checked=${quiz.checkedAfterOne}`);
  check("答满后可提交", quiz.submitDisabledAfterAll === false, `disabled=${quiz.submitDisabledAfterAll}`);
  check("提交前不显示解析", quiz.explanationsBefore === 0, "");
  check("提交后给出得分", /本次答对 \d\/3/.test(quiz.resultText), quiz.resultText);
  // 这轮三题全选了非正确项，所以得分必须是 0，并且进一步说出错题落在哪条学习目标上——
  // 光回一句“再看解析”，学习者并不知道该复习这一节的哪部分。
  // 卷子是随机的，所以只认“抽到的这几道题”对应的目标：既不能漏、也不许凭空多报一条。
  const missedGoals = [...new Set(quiz.objectives.map((line: string) => line.replace("检查目标：", "")))];
  const hintSegment = quiz.resultText.split("错题集中在：")[1] ?? "";
  const mentionedGoals = quiz.goals.filter((goal: string) => hintSegment.includes(goal));
  check(
    "未通过的试卷把错题指回具体学习目标",
    /本次答对 0\/3/.test(quiz.resultText) &&
      hintSegment.length > 0 &&
      missedGoals.length > 0 &&
      missedGoals.every((goal: string) => hintSegment.includes(goal)) &&
      mentionedGoals.length === missedGoals.length,
    quiz.resultText,
  );
  check("提交后逐题解析", quiz.explanationsAfter === 3, `解析 ${quiz.explanationsAfter} 条`);
  check("提交后标注正确与错误选项", quiz.correctMarks === 3 && quiz.incorrectMarks >= 1, `正确 ${quiz.correctMarks} 错误 ${quiz.incorrectMarks}`);
  check("提交后锁定作答不可改动", quiz.lockedInputs === 12, `锁定 ${quiz.lockedInputs} 个选项`);
  // 矩阵里写的复习出口是「把错题指回本节讲解」：只丢一句“回看这一节对应的讲解”时，
  // 学习者知道错在哪条目标，却不知道三条任务里该翻哪一条。这里真点一次，量到底有没有切过去。
  const exitTargetText = String(quiz.reviewExitTargetHeading).trim();
  check(
    "复习出口指回讲这条目标的任务，并在页面上真的切过去",
    quiz.reviewExitHiddenBefore === true &&
      quiz.reviewExitHiddenAfter === false &&
      typeof quiz.reviewExitLabel === "string" &&
      quiz.reviewExitLabel.length > 0 &&
      quiz.reviewExitNative === true &&
      JSON.stringify(quiz.reviewExitSteps) === JSON.stringify(quiz.reviewExitExpectedSteps) &&
      quiz.reviewExitSteps.length > 0 &&
      quiz.reviewExitTexts.every((text: string, index: number) => text.includes(`回任务 ${quiz.reviewExitSteps[index] + 1}`)) &&
      quiz.reviewExitPanelsAfter[quiz.reviewExitTargetStep] === true &&
      quiz.reviewExitPanelsAfter.filter(Boolean).length === 1 &&
      exitTargetText.startsWith(`任务 ${quiz.reviewExitTargetStep + 1}`) &&
      quiz.reviewExitFocusTag === "H2" &&
      String(quiz.reviewExitFocusText).startsWith(`任务 ${quiz.reviewExitTargetStep + 1}`) &&
      quiz.reviewExitRibbon.includes(`已回到任务 ${quiz.reviewExitTargetStep + 1}`) &&
      quiz.quizSubmittedStillLocked === 12 &&
      quiz.reviewExitBackToQuiz === true,
    `出口步骤=${JSON.stringify(quiz.reviewExitSteps)} 期望=${JSON.stringify(quiz.reviewExitExpectedSteps)} 按钮=${JSON.stringify(quiz.reviewExitTexts)}；面板 ${JSON.stringify(quiz.reviewExitPanelsAfter)}；焦点 ${quiz.reviewExitFocusTag}「${quiz.reviewExitFocusText}」；播报「${quiz.reviewExitRibbon}」`,
  );
  check("页面说明抽题方式并标明题目与解析已通过校验", quiz.reading === true && quiz.reviewNote === true, "");
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

  section("E2E-S1-01-07 词条载入失败与恢复");
  // 词条表面板由全部 40 节课共用，所以这条失败路径属于共享能力：载入失败时
  // 必须当场说明“这次没载入成功”、给出重新载入入口，并且不中断课件其他互动。
  await client.send("Network.enable");
  await client.send("Network.setBlockedURLs", { urls: ["*/glossary/faq.json"] });
  await visit(client);
  const catalogFailed = await client.evaluateJson<any>(`(async () => {
    const out = {};
    document.querySelector("#faqCatalogButton").click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const status = document.querySelector("[data-faq-status]");
    const retry = document.querySelector("[data-faq-retry]");
    const empty = document.querySelector("[data-faq-empty]");
    out.status = status.textContent.trim();
    out.role = status.getAttribute("role");
    out.live = status.getAttribute("aria-live");
    out.retryExists = !!retry;
    out.retryVisible = retry ? !retry.hidden : false;
    out.emptyText = empty.hidden ? "" : empty.textContent.trim();
    document.querySelector("#inspectSourceButton").click();
    out.pageFeedback = document.querySelector("#sourceFeedback").textContent.trim();
    return JSON.stringify(out);
  })()`);

  check("词条表载入失败时当场说明", catalogFailed.status.includes("无法载入") && !catalogFailed.status.includes("点课件里带虚线的词"), catalogFailed.status.slice(0, 32));
  check("给出重新载入词条表的入口", catalogFailed.retryExists === true && catalogFailed.retryVisible === true, `可见=${catalogFailed.retryVisible}`);
  check("失败说明里保留继续学习的出口", catalogFailed.emptyText.includes("仍可继续"), catalogFailed.emptyText.slice(0, 32));
  check("载入结果向辅助技术播报", catalogFailed.role === "status" && catalogFailed.live === "polite", `${catalogFailed.role}/${catalogFailed.live}`);
  check("词条表不可用时课件其他互动照常", catalogFailed.pageFeedback.includes("找到了"), catalogFailed.pageFeedback.slice(0, 20));

  await client.send("Network.setBlockedURLs", { urls: [] });
  const catalogRecovered = await client.evaluateJson<any>(`(async () => {
    const out = {};
    document.querySelector('[data-faq="main"]').click();
    await new Promise((resolve) => setTimeout(resolve, 250));
    document.querySelector("[data-faq-retry]").click();
    await new Promise((resolve) => setTimeout(resolve, 900));
    const retry = document.querySelector("[data-faq-retry]");
    out.status = document.querySelector("[data-faq-status]").textContent.trim();
    out.remember = document.querySelector("[data-faq-remember]").textContent.trim();
    out.retryHidden = retry.hidden;
    out.emptyHidden = document.querySelector("[data-faq-empty]").hidden;
    out.chips = document.querySelectorAll("[data-faq-list] [data-faq]").length;
    return JSON.stringify(out);
  })()`);

  check("重新载入后回到学习者刚才想看的词条", catalogRecovered.status.includes("程序开始干活的地方") && catalogRecovered.remember.includes("现在记住"), catalogRecovered.status.slice(0, 24));
  check("恢复后收起重新载入入口", catalogRecovered.retryHidden === true && catalogRecovered.emptyHidden === true, `hidden=${catalogRecovered.retryHidden}`);
  check("恢复后词条可以继续点选", catalogRecovered.chips > 0, `词条 ${catalogRecovered.chips} 个`);

  section("E2E-S1-01-08 词条面板脚本根本没载入成功");
  // 面板脚本自己也可能请求失败：课程挂在子路径下时旧地址会 404，网络中断或离线同样
  // 会让它拿不到。这时页面原先一句话都没有——按钮和带虚线的词条点了没反应，学习者
  // 只会以为课件坏了。这里屏蔽掉面板脚本本体，验证课件页会当场说明并给出重新载入入口。
  await client.send("Network.setBlockedURLs", { urls: ["*/glossary/faq-panel.js"] });
  await visit(client);
  const panelMissing = await client.evaluateJson<any>(`(() => {
    const out = {};
    const notice = document.querySelector("#faqPanelNotice");
    out.noticeExists = !!notice;
    out.noticeHidden = notice ? notice.hidden : null;
    out.text = notice ? notice.textContent.replace(/\\s+/g, " ").trim() : "";
    out.role = notice ? notice.getAttribute("role") : "";
    out.live = notice ? notice.getAttribute("aria-live") : "";
    out.reload = notice ? !!notice.querySelector('a[href="index.html"]') : false;
    out.panelBooted = typeof window.cspFaqPanel !== "undefined";
    // 面板缺席时按钮点了也不能崩：页面只是没有面板可用。
    document.querySelector("#faqCatalogButton").click();
    document.querySelector("#inspectSourceButton").click();
    out.pageFeedback = document.querySelector("#sourceFeedback").textContent.trim();
    return JSON.stringify(out);
  })()`);

  check("面板脚本没载入成功时当场说明", panelMissing.noticeExists === true && panelMissing.noticeHidden === false && panelMissing.text.includes("没有载入成功"), panelMissing.text.slice(0, 30));
  check("说明向辅助技术播报", panelMissing.role === "status" && panelMissing.live === "polite", `${panelMissing.role}/${panelMissing.live}`);
  check("给出重新载入入口", panelMissing.reload === true, "");
  check("面板缺席时课件其他互动照常", panelMissing.panelBooted === false && panelMissing.pageFeedback.includes("找到了"), panelMissing.pageFeedback.slice(0, 20));

  await client.send("Network.setBlockedURLs", { urls: [] });

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

  section("E2E-S1-01-06 会话中途保存失败与恢复");
  // 会话中途浏览器可能开始拒绝写入（配额用尽、隐私设置变化）。这条路径以前
  // 只把 storageAvailable 改成 false，而答题路径不会刷新提示，界面等于替
  // 学习者断言“已保存”。这里在真实浏览器里把 setItem 打坏，再修好。
  // 先导航到一个恢复正常存储的文档，再写入基线进度：上一个场景所在的文档
  // 仍然是存储被禁用的那个，在它里面写 localStorage 会静默失败。
  await visit(client);
  const seeded = await client.evaluateJson<any>(`(() => {
    const key = "csp-cpp-s1-01-progress-v1";
    try {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify({
        activeStep: 3,
        sourceInspected: true,
        sourceSaved: true,
        compiled: true,
        ran: true,
        debugSolved: true,
      }));
    } catch (error) {
      return JSON.stringify({ ok: false, reason: String(error) });
    }
    return JSON.stringify({ ok: (localStorage.getItem(key) ?? "").includes("debugSolved"), reason: "" });
  })()`);
  check("基线进度已就绪（会话中途失败场景前置）", seeded.ok === true, seeded.reason);
  await visit(client);

  const midSession = await client.evaluateJson<any>(`(() => {
    const key = "csp-cpp-s1-01-progress-v1";
    const notice = () => document.querySelector("#storageNotice");
    const ribbon = () => document.querySelector("#completionRibbon").textContent.trim();
    const answeredIds = () => Object.keys(JSON.parse(localStorage.getItem(key) ?? "{}").answers ?? {});
    const out = {};

    const radio = document.querySelector('#quizForm input[type="radio"]');
    out.answerCountBefore = answeredIds().length;

    const realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("quota exceeded for e2e", "QuotaExceededError");
    };
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));

    out.noticeHiddenWhileBlocked = notice().hidden;
    out.noticeText = notice().textContent.trim();
    out.retryOffered = !!notice().querySelector("[data-retry-storage-save]");
    out.answerCountWhileBlocked = answeredIds().length;
    out.answerStayedChecked = document.querySelector('#quizForm input[type="radio"]:checked') !== null;
    out.ribbonWhileBlocked = ribbon();
    // 随后的操作提示会刷新顶部提示条，但保存失败的说明必须留在页面上。
    out.noticeStillVisibleAfterAnnounce = notice().hidden === false;

    Storage.prototype.setItem = realSetItem;
    notice().querySelector("[data-retry-storage-save]").click();

    out.noticeHiddenAfterRetry = notice().hidden;
    out.ribbonAfterRetry = ribbon();
    out.answerCountAfterRetry = answeredIds().length;
    out.retryAfterRecovery = !!notice().querySelector("[data-retry-storage-save]");
    return JSON.stringify(out);
  })()`);

  check("会话中途保存失败立刻可见", midSession.noticeHiddenWhileBlocked === false, `hidden=${midSession.noticeHiddenWhileBlocked}`);
  check("失败提示说明刷新后不会恢复进度", midSession.noticeText.includes("刷新页面后不会恢复进度"), midSession.noticeText.slice(0, 40));
  check("失败提示不会被后续操作提示掩盖", midSession.noticeStillVisibleAfterAnnounce === true, midSession.ribbonWhileBlocked);
  check("失败时提供重试入口", midSession.retryOffered === true, "");
  check("失败时不把答案写成已保存", midSession.answerCountBefore === 0 && midSession.answerCountWhileBlocked === 0, `已保存答案 ${midSession.answerCountWhileBlocked} 条`);
  check("失败时当前会话仍保留作答", midSession.answerStayedChecked === true, "");
  check("重试后恢复保存并说明状态", midSession.noticeHiddenAfterRetry === true && midSession.ribbonAfterRetry.includes("已恢复"), midSession.ribbonAfterRetry);
  check("重试把待写答案补写落盘", midSession.answerCountAfterRetry === 1, `已保存答案 ${midSession.answerCountAfterRetry} 条`);
  check("恢复后不再显示重试入口", midSession.retryAfterRecovery === false, "");

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
if (checks.length !== expectedChecks) {
  console.error(
    `检查项数与声明不符：脚本声明 ${expectedChecks} 项，实际跑了 ${checks.length} 项。` +
      `\n请同步 tests/e2e/s1-01-cdp.ts、tests/e2e/manual-checklist.md、docs/roadmap.md 与 README.md 里的数字。`,
  );
  process.exit(3);
}
if (failed.length) {
  console.log(`失败项：${failed.map((item) => item.name).join(" | ")}`);
  process.exit(1);
}
console.log("S1-01 浏览器自动化复验全部通过。");
process.exit(0);
