import { expect, test } from "bun:test";
import { lessonDirectoryName, loadCurriculum } from "../scripts/curriculum";

const projectRoot = `${import.meta.dir}/..`;
const lessonsRoot = `${projectRoot}/lessons`;

// `tests/lesson-contract.test.ts` 校验的是题库本身；「抽出来的那 3 道题」一直没人验过：
// 同一次抽重、抽到非选择题、同一个试卷标识抽出不同题、或者抽题时把题库就地改写，
// 都只能在真的组一次卷之后才暴露。页面的三个函数是自包含的（只依赖 questionPool 与彼此），
// 所以可以原样取出来放进沙箱里跑，不必启动浏览器。
const seedSweep = 256;
// 一道题坏掉会让每个种子都报同样的错，256 行失败信息没人看得下去：每课最多列 6 条。
const reportLimitPerLesson = 6;
// 同一份种子必须永远给出同一串随机数：题库增删题不影响它，改掉它才会让学习者存下来的
// 试卷标识指向另一套题，所以这里锁死前 5 个取值。
const prngGolden = [0.627074, 0.002736, 0.527447, 0.981051, 0.968378];
const guardedFunctions = ["seededRandom", "questionSetForSeed", "questionsAreValid"] as const;

type Question = {
  id: string;
  type: string;
  prompt: string;
  options: string[];
  answer: number;
};

type LessonPage = {
  directory: string;
  courseId: string;
  source: string;
  manifest: { assessment: { questionCount: number; questionBankSize: number } };
};

type PaperSandbox = {
  seededRandom: (seed: number) => () => number;
  questionSetForSeed: (seed: number) => Question[];
  questionsAreValid: (questions: unknown) => boolean;
  poolSnapshot: () => string;
};

// 函数体里既有字符串又有对象字面量，按花括号配对截取时必须先跳过引号内的内容，
// 否则 `"}"` 之类的内容会提前结束截取。
function sliceBraces(source: string, start: number): string {
  let depth = 0;
  let index = start;
  let quote: string | null = null;

  for (; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }

    if (character === '"' || character === "'" || character === "`") quote = character;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error("组卷函数的花括号没有配对，无法截取实现");
}

function extractFunction(source: string, name: string, directory: string): string {
  const match = new RegExp(`function ${name}\\s*\\(`).exec(source);

  if (!match) throw new Error(`${directory} 里找不到 function ${name}`);

  const braceStart = source.indexOf("{", match.index);
  const signature = source.slice(match.index + `function ${name}`.length, braceStart);

  return `function ${name}${signature}${sliceBraces(source, braceStart)}`;
}

function extractQuestionPool(source: string, directory: string): Question[] {
  const match = source.match(/const questionPool = (\[[\s\S]*?\n {6}\]);/);

  if (!match) throw new Error(`${directory} 里找不到 questionPool`);

  // 复制一份，避免沙箱里跑出来的结果和页面源码共用同一个数组。
  return JSON.parse(JSON.stringify(Function(`"use strict"; return (${match[1]});`)())) as Question[];
}

function buildSandbox(source: string, directory: string): PaperSandbox {
  const pool = extractQuestionPool(source, directory);
  const script = `
    const questionPool = ${JSON.stringify(pool)};
    ${guardedFunctions.map((name) => extractFunction(source, name, directory)).join("\n")}
    return {
      seededRandom,
      questionSetForSeed,
      questionsAreValid,
      poolSnapshot: () => JSON.stringify(questionPool),
    };
  `;

  return Function(`"use strict"; ${script}`)() as PaperSandbox;
}

async function readLessonPages(): Promise<LessonPage[]> {
  const curriculum = await loadCurriculum();

  return Promise.all(
    curriculum.map(async (course) => {
      const directory = lessonDirectoryName(course.id);

      return {
        directory,
        courseId: course.id,
        source: await Bun.file(`${lessonsRoot}/${directory}/index.html`).text(),
        manifest: (await Bun.file(`${lessonsRoot}/${directory}/lesson.json`).json()) as LessonPage["manifest"],
      };
    }),
  );
}

test("40 课的抽题与校验共用同一份实现", async () => {
  const pages = await readLessonPages();
  const problems: string[] = [];

  expect(pages.length).toBeGreaterThan(0);

  const bodiesFor = (page: LessonPage) =>
    Object.fromEntries(
      guardedFunctions.map((name) => [name, extractFunction(page.source, name, page.directory).replace(/\s+/g, " ")]),
    );
  const reference = bodiesFor(pages[0]);

  for (const page of pages) {
    const bodies = bodiesFor(page);

    for (const name of guardedFunctions) {
      if (bodies[name] !== reference[name])
        problems.push(`${page.courseId}: ${name} 与样板不一致，抽题规则被人单独改过`);
    }
  }

  expect(problems).toEqual([]);
});

test("每次组卷的题数、题目唯一性与题型都符合课程清单", async () => {
  const pages = await readLessonPages();
  const problems: string[] = [];

  for (const page of pages) {
    const sandbox = buildSandbox(page.source, page.directory);
    const poolIds = new Set(extractQuestionPool(page.source, page.directory).map((question) => question.id));
    const expectedCount = page.manifest.assessment.questionCount;
    const lessonBase = problems.length;

    for (let seed = 0; seed < seedSweep; seed += 1) {
      const paper = sandbox.questionSetForSeed(seed);
      const label = `${page.courseId} seed=${seed}`;
      const ids = paper.map((question) => question.id);

      if (paper.length !== expectedCount)
        problems.push(`${label}: 抽到 ${paper.length} 道题，课程清单写的是 ${expectedCount} 道`);
      if (new Set(ids).size !== ids.length) problems.push(`${label}: 同一次组卷里出现了重复题目 ${ids.join(",")}`);

      for (const question of paper) {
        if (!poolIds.has(question.id)) problems.push(`${label}: 抽出了不属于本课题库的题 ${question.id}`);
        // 组卷只认选择题：抽进非选择题会让整份试卷被判为不可用，学习者只会看到「题库暂时不可用」。
        if (question.type !== "choice") problems.push(`${label}: 抽到了非选择题 ${question.id}`);
        if (!Number.isInteger(question.answer) || question.options?.[question.answer] == null)
          problems.push(`${label}: 题目 ${question.id} 的正确答案不在选项里`);
      }

      if (problems.length - lessonBase >= reportLimitPerLesson) {
        problems.push(`${page.courseId}: 其余 ${seedSweep - seed - 1} 个种子不再逐条列出`);
        break;
      }
    }
  }

  expect(problems).toEqual([]);
});

test("同一个试卷标识永远组出同一套题，且抽题不会改写题库", async () => {
  const pages = await readLessonPages();
  const problems: string[] = [];

  for (const page of pages) {
    const sandbox = buildSandbox(page.source, page.directory);
    const before = sandbox.poolSnapshot();
    const variants = new Set<string>();
    const lessonBase = problems.length;

    for (let seed = 0; seed < seedSweep; seed += 1) {
      const first = sandbox.questionSetForSeed(seed).map((question) => question.id).join(",");
      const second = sandbox.questionSetForSeed(seed).map((question) => question.id).join(",");

      if (first !== second) problems.push(`${page.courseId} seed=${seed}: 同一个试卷标识两次组卷给出了不同的题`);
      variants.add(first);

      if (problems.length - lessonBase >= reportLimitPerLesson) {
        problems.push(`${page.courseId}: 其余 ${seedSweep - seed - 1} 个种子不再逐条列出`);
        break;
      }
    }

    // 种子不生效（每次都抽出同一套）同样是坏掉的随机，但不会让上面任何一条断言失败。
    if (variants.size < 2) problems.push(`${page.courseId}: 换试卷标识抽不出不同的题，种子没有生效`);
    if (sandbox.poolSnapshot() !== before) problems.push(`${page.courseId}: 抽题改写了题库本身，重复组卷会越抽越少`);
  }

  expect(problems).toEqual([]);

  const sample = buildSandbox(pages[0].source, pages[0].directory);
  const random = sample.seededRandom(1);

  expect(prngGolden.map(() => Number(random().toFixed(6)))).toEqual(prngGolden);
});

test("题库里的每道题都抽得到，不会出现永远看不到的题", async () => {
  const pages = await readLessonPages();
  const problems: string[] = [];

  for (const page of pages) {
    const sandbox = buildSandbox(page.source, page.directory);
    const drawn = new Set<string>();

    for (let seed = 0; seed < seedSweep; seed += 1) {
      for (const question of sandbox.questionSetForSeed(seed)) drawn.add(question.id);
    }

    for (const question of extractQuestionPool(page.source, page.directory)) {
      // 一道题永远抽不到，等于它对应的学习目标从没进过检验；题库里写着的题必须都有机会出现。
      if (!drawn.has(question.id))
        problems.push(`${page.courseId}: 题目 ${question.id} 在 ${seedSweep} 个种子下从未被抽到`);
    }
  }

  expect(problems).toEqual([]);
});

test("空题库或无效题目必须被判为不可用，不能拿去组卷", async () => {
  const pages = await readLessonPages();
  const problems: string[] = [];
  const valid: Question = { id: "x", type: "choice", prompt: "下列哪一个说法对？", options: ["A", "B"], answer: 0 };
  const rejects: [string, unknown][] = [
    ["空题库", []],
    ["题库不是数组", null],
    ["正确答案越界", [{ ...valid, answer: 2 }]],
    ["正确答案为负", [{ ...valid, answer: -1 }]],
    ["题型不是选择题", [{ ...valid, type: "fill" }]],
    ["只剩一个选项", [{ ...valid, options: ["A"] }]],
    ["缺少题干", [{ ...valid, prompt: undefined }]],
  ];

  for (const page of pages) {
    const { questionsAreValid } = buildSandbox(page.source, page.directory);

    if (!questionsAreValid([valid]))
      problems.push(`${page.courseId}: 合法题目被判成不可用，正常试卷会被挡下`);

    for (const [label, questions] of rejects) {
      if (questionsAreValid(questions)) problems.push(`${page.courseId}: ${label}没有被判为不可用`);
    }
  }

  expect(problems).toEqual([]);
});
