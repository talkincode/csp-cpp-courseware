import { expect, test } from "bun:test";
import { lessonDirectoryName, loadCurriculum } from "../scripts/curriculum";

// 键盘可达与焦点可见契约。
//
// AGENTS.md 要求课件「维持键盘可达、清晰焦点态」，不能让只用键盘的学习者卡住。
// 40 课页面都是真实浏览器渲染后才有的行为，所以运行期那条留在 `tests/e2e/keyboard-cdp.ts`
// 用真实按键复验；这里守的是「新写的课不能让同一类缺陷复活」的结构契约：
//
//   1. 小测作答会整块重渲染题目区，重渲染必须把焦点交还给刚答的那一项——
//      否则只用键盘的学习者每答完一题焦点就掉到文档主体，看不见焦点环、读屏也不知道自己在哪。
//   2. 提交成功后提交按钮会变成 disabled，浏览器随即把焦点丢回文档主体；必须把焦点交给结果区，
//      否则得分与解析出现的那一刻正好是键盘学习者失去位置的那一刻。
//   3. 焦点指示规则必须覆盖 button / a / input，且不能是 outline: none。
//   4. 不得用正数 tabindex 把控件从自然 Tab 顺序里拽出来，也不得把原生控件用 tabindex="-1" 移出 Tab 顺序。
//   5. 步进门闩要用 aria-disabled（保留键盘可发现性），静态标记里不能直接写 disabled。
//   6. 音效开关必须是原生按钮并带 aria-pressed，保证只能由学习者主动操作触发。
//
// 运行期「门闩不会被键盘绕过」由 E2E 用真实按键验；这里只锁静态形状，两处配合才完整。

const projectRoot = `${import.meta.dir}/..`;
const lessonsRoot = `${projectRoot}/lessons`;

type Page = { directory: string; source: string };

async function readLessonPages(): Promise<Page[]> {
  const curriculum = await loadCurriculum();
  const directories = [...new Set(curriculum.map((lesson) => lesson.id))].map((id) => lessonDirectoryName(id));

  return Promise.all(
    directories.map(async (directory) => ({
      directory,
      source: await Bun.file(`${lessonsRoot}/${directory}/index.html`).text(),
    })),
  );
}

/** 取 <tag ...> 开标签，属性值里可能有 >（例如 placeholder="score >= 90"），必须在一对引号之外找标签结尾。 */
function findTags(source: string, tagName: string): string[] {
  const tags: string[] = [];
  const openPattern = new RegExp(`<${tagName}\\b`, "g");
  let match: RegExpExecArray | null;

  while ((match = openPattern.exec(source)) !== null) {
    let index = match.index + match[0].length;
    let quote: string | null = null;

    while (index < source.length) {
      const char = source[index];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        break;
      }
      index += 1;
    }

    tags.push(source.slice(match.index, index + 1));
  }

  return tags;
}

/** 按大括号配平取出一段以 `header` 开头的代码块，字符串与模板字面量里的括号不计入。 */
function extractBlock(source: string, header: string): string {
  const start = source.indexOf(header);
  if (start === -1) return "";
  const bodyStart = source.indexOf("{", start);
  if (bodyStart === -1) return "";

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart, index + 1);
    }
  }

  return "";
}

const pages = await readLessonPages();

test("每课的小测作答重渲染后必须把焦点交还给刚答的那一项", () => {
  const offenders: string[] = [];

  for (const page of pages) {
    const handler = extractBlock(page.source, 'quizForm.addEventListener("change"');
    if (!handler) {
      offenders.push(`${page.directory}：找不到 quizForm 的 change 处理器`);
      continue;
    }

    const renderIndex = handler.lastIndexOf("renderQuiz()");
    const restoreIndex = handler.indexOf("focusQuizAnswer(");

    if (respondsToChange(handler) && renderIndex === -1) {
      offenders.push(`${page.directory}：作答后没有重渲染，契约需要复核`);
      continue;
    }

    if (renderIndex !== -1 && restoreIndex === -1) {
      offenders.push(
        `${page.directory}：作了答却没有在重渲染后把焦点交还给刚答的那一项，键盘学习者答完一题焦点就掉到文档主体`,
      );
      continue;
    }

    if (renderIndex !== -1 && restoreIndex < renderIndex) {
      offenders.push(`${page.directory}：交还焦点排在重渲染之前，重渲染会立刻把焦点再抹掉`);
    }
  }

  expect(offenders).toEqual([]);
});

test("交还焦点的实现要真的按 name 与 value 找回那一项并聚焦", () => {
  const offenders: string[] = [];

  for (const page of pages) {
    const body = extractBlock(page.source, "function focusQuizAnswer(");
    if (!body) {
      offenders.push(`${page.directory}：没有 focusQuizAnswer 的实现`);
      continue;
    }

    for (const fragment of ['radio.name === name', 'radio.value === value', "radio.focus("]) {
      if (!body.includes(fragment)) {
        offenders.push(`${page.directory}：focusQuizAnswer 缺少「${fragment}」`);
      }
    }
  }

  expect(offenders).toEqual([]);
});

test("小测提交后必须把焦点交给结果区，不能掉回文档主体", () => {
  const offenders: string[] = [];

  for (const page of pages) {
    const resultTags = findTags(page.source, "p").filter((tag) => /\bid="quizResult"/.test(tag));
    if (resultTags.length !== 1) {
      offenders.push(`${page.directory}：找不到唯一的小测结果区 #quizResult`);
      continue;
    }

    if (!/tabindex="-1"/.test(resultTags[0]!)) {
      offenders.push(`${page.directory}：结果区没有 tabindex="-1"，提交后没法把焦点交给它`);
    }

    const helper = extractBlock(page.source, "function focusQuizResult(");
    if (!helper || !/quizResult\.focus\(/.test(helper)) {
      offenders.push(`${page.directory}：没有 focusQuizResult 的实现`);
    }

    const handler = extractBlock(page.source, 'document.querySelector("#submitQuizButton").addEventListener("click"');
    if (!handler) {
      offenders.push(`${page.directory}：找不到提交按钮的处理器`);
      continue;
    }

    // 提交成功时按钮会变成 disabled，浏览器随即把焦点丢回文档主体——
    // 正好是得分与逐题解析出现的那一刻，键盘学习者得从页首重新 Tab 十几个停靠点。
    const calls = [...handler.matchAll(/focusQuizResult\(\)/g)].length;
    const scoredIndex = handler.indexOf("state.quizSubmitted = true");
    // 取最后一次调用：成功路径的那一次排在计分之后，题库不可用分支的那一次排在它前面。
    const lastCallIndex = handler.lastIndexOf("focusQuizResult()");

    if (calls < 2) {
      offenders.push(
        `${page.directory}：提交处理器里只调用了 ${calls} 次 focusQuizResult，成功路径与「题库不可用」路径都要交还焦点`,
      );
    }

    if (scoredIndex === -1 || lastCallIndex < scoredIndex) {
      offenders.push(`${page.directory}：计分重渲染之后没有把焦点交给结果区，得分出现时焦点仍在文档主体`);
    }
  }

  expect(offenders).toEqual([]);
});

test("焦点指示规则覆盖 button / a / input，且不是 outline: none", () => {
  const offenders: string[] = [];

  for (const page of pages) {
    const rules = [...page.source.matchAll(/([^{}]*:focus-visible[^{}]*)\{([^}]*)\}/g)];
    const coveredSelector = rules.map((rule) => rule[1]).join(",");

    for (const selector of ["button", "a", "input"]) {
      if (!new RegExp(`(^|[,\\s])${selector}\\s*:focus-visible`).test(coveredSelector)) {
        offenders.push(`${page.directory}：没有给 ${selector} 定义 :focus-visible 焦点环`);
      }
    }

    const strongEnough = rules.some((rule) => /outline\s*:\s*(?!none)[^;}]/.test(rule[2]));
    if (!strongEnough) {
      offenders.push(`${page.directory}：:focus-visible 没有给出可见 outline（不能是 none）`);
    }
  }

  expect(offenders).toEqual([]);
});

test("不得用 tabindex 改写自然 Tab 顺序", () => {
  const offenders: string[] = [];

  for (const page of pages) {
    for (const value of page.source.matchAll(/tabindex="(-?\d+)"/g)) {
      const numeric = Number(value[1]);
      if (numeric > 0) {
        offenders.push(`${page.directory}：正数 tabindex="${numeric}" 会把控件从自然 Tab 顺序里拽出来`);
      }
    }

    for (const tag of findTags(page.source, "button").concat(findTags(page.source, "input"))) {
      if (/tabindex="-1"/.test(tag)) {
        offenders.push(`${page.directory}：原生控件被 tabindex="-1" 移出 Tab 顺序：${tag.slice(0, 80)}`);
      }
    }
  }

  expect(offenders).toEqual([]);
});

test("步进门闩保留键盘可发现性，静态标记里不写 disabled", () => {
  const offenders: string[] = [];

  for (const page of pages) {
    const stepButtons = findTags(page.source, "button").filter((tag) => /\bdata-step="/.test(tag));
    if (stepButtons.length === 0) {
      offenders.push(`${page.directory}：找不到步进按钮`);
      continue;
    }

    for (const tag of stepButtons) {
      if (/\bdisabled\b/.test(tag) && !/aria-disabled/.test(tag)) {
        offenders.push(`${page.directory}：步进按钮用 disabled 挡住了键盘，应当用 aria-disabled`);
      }
    }
  }

  expect(offenders).toEqual([]);
});

test("音效开关是原生按钮并有 aria-pressed，声音只由学习者主动操作触发", () => {
  const offenders: string[] = [];

  for (const page of pages) {
    const toggle = findTags(page.source, "button").find((tag) => /id="soundToggle"/.test(tag));
    if (!toggle) {
      offenders.push(`${page.directory}：找不到音效开关按钮`);
      continue;
    }

    if (!/aria-pressed="(true|false)"/.test(toggle)) {
      offenders.push(`${page.directory}：音效开关缺少 aria-pressed，读屏说不出当前开关状态`);
    }

    if (!/soundToggle\.addEventListener\("click"/.test(page.source)) {
      offenders.push(`${page.directory}：音效开关只应由学习者主动点击/回车切换`);
    }
  }

  expect(offenders).toEqual([]);
});

test("课程目录页同样不给正数 tabindex，并保留读屏状态区", async () => {
  const source = await Bun.file(`${projectRoot}/index.html`).text();

  const positiveTabindex = [...source.matchAll(/tabindex="(-?\d+)"/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value > 0);

  expect(positiveTabindex).toEqual([]);
  expect(source).toMatch(/role="status"/);
  expect(source).toMatch(/aria-live="polite"/);
});

/** 只有真的会在作答后重渲染的处理器才需要交还焦点；返回它是否读了输入值。 */
function respondsToChange(handler: string): boolean {
  return /state\.answers\[input\.name\]/.test(handler) || /input\.value/.test(handler);
}
