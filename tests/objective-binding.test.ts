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
