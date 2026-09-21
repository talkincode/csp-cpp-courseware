import { expect, test } from "bun:test";
import { lessonDirectoryName, loadCurriculum } from "../scripts/curriculum";

const projectRoot = `${import.meta.dir}/..`;
const lessonsRoot = `${projectRoot}/lessons`;

// `docs/roadmap.md` 里点过名的一处缺口：题库的「检查目标」一直是自由文本，
// 没有和 `courseData` 声明的学习目标条目绑在一起。于是题库只能保证“目标描述非空”，
// 回答不了“这节课的哪几条学习目标真的被考到了”，错题也指不回该复习哪条目标。
// 这里把绑定变成可机读的契约：每道题用 `objectiveIndex` 指向本课第几条学习目标，
// 页面把那条目标的原文渲染给学习者，`lesson.json` 再如实登记哪些目标还没有题目覆盖——
// 多登记、少登记、指错条目都会当场失败。
type Question = {
  id: string;
  objective: string;
  objectiveIndex: number;
  difficulty: string;
  type: string;
};

type Assessment = {
  questionBankSize: number;
  objectiveCoverage?: { assessed: number; total: number };
  uncoveredObjectives?: number[];
};

type LessonPage = {
  directory: string;
  courseId: string;
  objectives: string[];
  source: string;
  pool: Question[];
  manifest: { assessment: Assessment };
};

function extractCourseObjectives(source: string, directory: string): string[] {
  const match = source.match(/const courseObjectives = (\[[\s\S]*?\n {6}\]);/);

  if (!match) throw new Error(`${directory}: 页面里找不到 courseObjectives`);

  return Function(`"use strict"; return (${match[1]});`)() as string[];
}

function extractQuestionPool(source: string, directory: string): Question[] {
  const match = source.match(/const questionPool = (\[[\s\S]*?\n {6}\]);/);

  if (!match) throw new Error(`${directory}: 页面里找不到 questionPool`);

  return Function(`"use strict"; return (${match[1]});`)() as Question[];
}

async function readLessonPages(): Promise<LessonPage[]> {
  const curriculum = await loadCurriculum();

  return Promise.all(
    curriculum.map(async (course) => {
      const directory = lessonDirectoryName(course.id);
      const source = await Bun.file(`${lessonsRoot}/${directory}/index.html`).text();

      return {
        directory,
        courseId: course.id,
        objectives: course.objectives,
        source,
        pool: extractQuestionPool(source, directory),
        manifest: (await Bun.file(`${lessonsRoot}/${directory}/lesson.json`).json()) as LessonPage["manifest"],
      };
    }),
  );
}

const pages = await readLessonPages();

test("每课页面里的课程目标副本与 courseData 逐条一致", () => {
  const problems: string[] = [];

  for (const page of pages) {
    const copy = extractCourseObjectives(page.source, page.directory);

    // 页面是自包含的，学习目标必须在页面里也有一份；但它只是副本，
    // 一旦 courseData 改了目标措辞而页面没跟上，学习者看到的“检查目标”就是过期事实。
    if (JSON.stringify(copy) !== JSON.stringify(page.objectives)) {
      problems.push(`${page.courseId}: 页面里的课程目标与 courseData 不一致（页面 ${copy.length} 条 / courseData ${page.objectives.length} 条）`);
    }
  }

  expect(problems).toEqual([]);
});

test("每道题都用 objectiveIndex 绑到本课的一条学习目标", () => {
  const problems: string[] = [];

  for (const page of pages) {
    for (const question of page.pool) {
      const index = question.objectiveIndex;

      if (!Number.isInteger(index)) {
        problems.push(`${page.courseId} ${question.id}: objectiveIndex 不是整数（${index}）`);
        continue;
      }

      if (index < 0 || index >= page.objectives.length) {
        problems.push(`${page.courseId} ${question.id}: objectiveIndex=${index} 落在本课 ${page.objectives.length} 条目标之外`);
      }
    }
  }

  expect(problems).toEqual([]);
});

test("检查目标渲染的是绑定后的课程目标，自由文本另起一行保留", () => {
  const problems: string[] = [];

  for (const page of pages) {
    // 学习者看到的“检查目标”必须是课程目标原文，否则绑定就只是元数据里的摆设。
    if (!page.source.includes("检查目标：${escapeHtml(courseObjectives[question.objectiveIndex])}")) {
      problems.push(`${page.courseId}: 检查目标没有渲染成绑定的课程目标`);
    }

    // 更细的“这道题具体查什么”仍然有用，不能因为加了绑定就丢掉。
    if (!page.source.includes("本题检查：${escapeHtml(question.objective)}")) {
      problems.push(`${page.courseId}: 没有保留逐题的自由检查说明`);
    }
  }

  expect(problems).toEqual([]);
});

test("未通过的试卷会把错题指回具体学习目标", () => {
  const problems: string[] = [];

  for (const page of pages) {
    // 绑定要能变成复习出口：错题要说出落在哪条学习目标上，而不是只回一句“再看解析”。
    if (!page.source.includes("错题集中在：")) problems.push(`${page.courseId}: 提交后没有按学习目标汇总错题`);
    if (!/missedGoals[\s\S]{0,400}courseObjectives\[question\.objectiveIndex\]/.test(page.source))
      problems.push(`${page.courseId}: 错题汇总没有用到 objectiveIndex 绑定`);
  }

  expect(problems).toEqual([]);
});

/** 按大括号配平取出一段以 `header` 开头的代码块。 */
function sourceBlock(source: string, header: string): string {
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

/** 取页面里的 `objectiveReviewStep` 映射：第几条学习目标由第几个任务讲。 */
function extractReviewSteps(source: string, directory: string): number[] | null {
  const match = source.match(/const objectiveReviewStep = (\[[\s\S]*?\n\s*\]);/);
  if (!match) return null;

  const steps = Function(`"use strict"; return (${match[1]});`)() as unknown;
  if (!Array.isArray(steps)) throw new Error(`${directory}: objectiveReviewStep 不是数组`);

  return steps as number[];
}

/** 面板序号里最大的那个就是小测自己的面板；复习出口只能指向它前面的讲解任务。 */
function extractQuizStep(source: string, directory: string): number {
  const panels = [...source.matchAll(/<section class="step-panel" data-panel="(\d+)"/g)].map((match) => Number(match[1]));
  if (panels.length < 2) throw new Error(`${directory}: 找不到任务面板`);

  return Math.max(...panels);
}

test("复习出口把每条学习目标指回讲它的那个任务，且落在小测面板内", () => {
  const problems: string[] = [];

  for (const page of pages) {
    const quizStep = extractQuizStep(page.source, page.directory);

    // 结果区旁边那句“回看这一节对应的讲解”必须真能点回去：只有文字时，
    // 学习者知道错在哪条目标，却不知道三条任务里该翻哪一条。
    const exits = [...page.source.matchAll(/<nav\b[^>]*\bid="quizReviewExit"[^>]*>/g)].map((match) => match[0]);
    if (exits.length !== 1) {
      problems.push(`${page.courseId}: 找不到唯一的复习出口 #quizReviewExit（${exits.length} 个）`);
      continue;
    }

    const exitTag = exits[0]!;
    if (!/\bhidden\b/.test(exitTag)) problems.push(`${page.courseId}: 复习出口默认没有 hidden，没做错题时也会露出空壳`);
    if (!/aria-label="[^"]+"/.test(exitTag)) problems.push(`${page.courseId}: 复习出口缺少 aria-label`);

    const exitIndex = page.source.indexOf(exitTag);
    if (exitIndex < page.source.indexOf('id="quizResult"')) {
      problems.push(`${page.courseId}: 复习出口排在结果区之前，得分还没出现它就露出来了`);
    }
    if (exitIndex > page.source.indexOf('<aside class="external-boundary">')) {
      problems.push(`${page.courseId}: 复习出口落在小测面板之外，看到得分时它已经滚出视野`);
    }

    const steps = extractReviewSteps(page.source, page.directory);
    if (!steps) {
      problems.push(`${page.courseId}: 没有 objectiveReviewStep 映射`);
      continue;
    }

    if (steps.length !== page.objectives.length) {
      problems.push(`${page.courseId}: 映射有 ${steps.length} 条，本课有 ${page.objectives.length} 条学习目标`);
    }

    // 指向小测自己（或越界）都是死路：那一步只会把学习者带回刚做完的卷子。
    steps.forEach((step, objectiveIndex) => {
      if (!Number.isInteger(step) || step < 0 || step >= quizStep) {
        problems.push(
          `${page.courseId}: 第 ${objectiveIndex + 1} 条目标指向任务 ${step + 1}，本课的讲解任务只有 1 至 ${quizStep} 个`,
        );
      }
    });

    for (const fragment of ["objectiveReviewStep[", "data-review-step", 'createElement("button")']) {
      if (!page.source.includes(fragment)) problems.push(`${page.courseId}: 复习出口没有用上 ${fragment}`);
    }

    // 没有错题时出口必须收起来，否则会把“没有薄弱项”也说成要找地方复习。
    if (!/quizReviewExit\.hidden = /.test(page.source)) problems.push(`${page.courseId}: 复习出口没有按错题情况收起`);
  }

  expect(problems).toEqual([]);
});

test("复习出口点下去要真的切到那个任务，并把焦点交给它的标题", () => {
  const problems: string[] = [];

  for (const page of pages) {
    const helper = sourceBlock(page.source, 'quizReviewExit.addEventListener("click"');
    if (!helper) {
      problems.push(`${page.courseId}: 复习出口没有点击处理器`);
      continue;
    }

    // 切面板本身要复用步进的门闩逻辑（未解锁的任务不能被出口绕过去）。
    if (!helper.includes("selectStep(")) problems.push(`${page.courseId}: 复习出口没有走 selectStep 切换任务`);

    // 点下去以后这个按钮自己会在被隐藏的面板里，焦点必须交给目标面板的标题，
    // 否则键盘学习者的焦点当场掉回文档主体。
    if (!/\.focus\(/.test(helper)) problems.push(`${page.courseId}: 复习出口没有把焦点交给目标面板标题`);
    if (!helper.includes("h2")) problems.push(`${page.courseId}: 复习出口没有把焦点落在目标任务的标题上`);
  }

  expect(problems).toEqual([]);
});

test("每个任务面板的标题都能接收程序化焦点", () => {
  const problems: string[] = [];

  for (const page of pages) {
    const headings = [...page.source.matchAll(/<section class="step-panel" data-panel="(\d+)"[^>]*>\s*<h2([^>]*)>/g)];

    if (headings.length !== extractQuizStep(page.source, page.directory) + 1) {
      problems.push(`${page.courseId}: 只认到 ${headings.length} 个任务标题，面板结构可能变了`);
      continue;
    }

    for (const heading of headings) {
      if (!/tabindex="-1"/.test(heading[2]!)) {
        problems.push(`${page.courseId}: 任务 ${Number(heading[1]) + 1} 的标题不能接收焦点，复习出口没法把焦点交还给它`);
      }
    }
  }

  expect(problems).toEqual([]);
});

test("lesson.json 如实登记还未被题库覆盖的学习目标", () => {
  const problems: string[] = [];

  for (const page of pages) {
    const assessment = page.manifest.assessment;
    const total = page.objectives.length;
    const covered = new Set(page.pool.map((question) => question.objectiveIndex));
    const truth = [...Array(total).keys()].filter((index) => !covered.has(index));
    const declared = assessment.uncoveredObjectives;

    if (!Array.isArray(declared)) {
      problems.push(`${page.courseId}: assessment.uncoveredObjectives 缺失`);
      continue;
    }

    // 清单只有和现场精确一致才有意义：补了一道覆盖该目标的题却忘了划掉，
    // 或者反过来漏登记，都说明这份清单已经不再描述事实。
    if (JSON.stringify([...declared].sort((a, b) => a - b)) !== JSON.stringify(truth)) {
      problems.push(
        `${page.courseId}: 登记的未覆盖目标 [${declared}] 与现场实际 [${truth}] 不一致（题库 ${page.pool.length} 题 / 目标 ${total} 条）`,
      );
    }

    if (covered.size === 0) problems.push(`${page.courseId}: 没有任何一道题绑到学习目标`);

    const coverage = assessment.objectiveCoverage;
    if (!coverage) {
      problems.push(`${page.courseId}: assessment.objectiveCoverage 缺失`);
      continue;
    }

    if (coverage.total !== total)
      problems.push(`${page.courseId}: objectiveCoverage.total=${coverage.total}，本课实际有 ${total} 条学习目标`);
    if (coverage.assessed !== total - truth.length)
      problems.push(`${page.courseId}: objectiveCoverage.assessed=${coverage.assessed}，现场是 ${total - truth.length} 条`);
  }

  expect(problems).toEqual([]);
});

test("题库声明的题数与页面里的题目数量一致", () => {
  const problems: string[] = [];

  for (const page of pages) {
    if (page.pool.length !== page.manifest.assessment.questionBankSize)
      problems.push(
        `${page.courseId}: 题库里有 ${page.pool.length} 题，lesson.json 写的是 ${page.manifest.assessment.questionBankSize} 题`,
      );
  }

  expect(problems).toEqual([]);
});

test("抽取本身要能被验证：40 课共 200 道以上的题目都要有绑定", () => {
  const totalQuestions = pages.reduce((count, page) => count + page.pool.length, 0);

  // 正则写法一变、抽取失效，上面所有断言都会在空数组上无声通过，所以这里钉一个下限。
  expect(pages.length).toBe(40);
  expect(totalQuestions).toBeGreaterThanOrEqual(200);
});
