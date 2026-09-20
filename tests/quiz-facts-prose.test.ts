import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { lessonDirectoryName, loadCurriculum } from "../scripts/curriculum";

const projectRoot = `${import.meta.dir}/..`;
const roadmapPath = `${projectRoot}/docs/roadmap.md`;

// `docs/roadmap.md` 的缺口段一度点名说 `lessons/s1-03/` 缺「掌握整除与取模」，
// 可现场那条目标被 4 道题覆盖着，真正一道题都没考的是「把文字公式翻译成 C++ 表达式」。
// 这种「文档点名了哪条学习目标还没被考到」的说法，抄数字的护栏拦不住：
// 数字对得上、名字写错，读文档的人照着补题就会补错一条目标。
// 这里把点名的那条目标原文绑回本课 `courseData`，并让「N 课三条目标全覆盖」跟着现场走。
type LessonCoverage = {
  directory: string;
  courseId: string;
  objectives: string[];
  uncoveredObjectives: string[];
  poolSize: number;
  questionCount: number;
};

function readRoadmap(): string {
  return readFileSync(roadmapPath, "utf8");
}

// 「N 课三条目标全覆盖」只检查写了数量的那种句子；改成别的措辞就不拦，避免把文档改写当失败。
function claimedFullCoverageCounts(roadmap: string): number[] {
  return [...roadmap.matchAll(/(\d+)\s*课三条目标全覆盖/g)].map((match) => Number(match[1]));
}

// 缺口点名的写法固定成 `lessons/<目录>/`（缺「<目标原文>」），一节课一条。
function claimedGaps(roadmap: string): Array<{ directory: string; objective: string }> {
  return [...roadmap.matchAll(/`lessons\/([a-z0-9-]+)\/`（缺「([^」]+)」）/g)].map((match) => ({
    directory: match[1],
    objective: match[2],
  }));
}

async function readCoverage(): Promise<LessonCoverage[]> {
  const curriculum = await loadCurriculum();

  return Promise.all(
    curriculum.map(async (course) => {
      const directory = lessonDirectoryName(course.id);
      const source = await Bun.file(`${projectRoot}/lessons/${directory}/index.html`).text();
      const manifest = (await Bun.file(`${projectRoot}/lessons/${directory}/lesson.json`).json()) as {
        assessment: { uncoveredObjectives?: number[]; questionCount: number };
      };
      const poolMatch = source.match(/const questionPool = (\[[\s\S]*?\n {6}\]);/);

      if (!poolMatch) throw new Error(`${directory}: unable to locate questionPool in index.html`);

      // 现场事实以题库为准，不读 `lesson.json` 登记的那份——登记本身另有用例校验，
      // 这里要回答的是「文档说的和真被考到的目标是否一致」。
      const pool = Function(`"use strict"; return (${poolMatch[1]});`)() as Array<{ objectiveIndex: number }>;
      const covered = new Set(pool.map((question) => question.objectiveIndex));

      return {
        directory,
        courseId: course.id,
        objectives: course.objectives,
        uncoveredObjectives: course.objectives.filter((_, index) => !covered.has(index)),
        poolSize: pool.length,
        questionCount: manifest.assessment.questionCount,
      };
    }),
  );
}

test("roadmap 写的「N 课三条目标全覆盖」与现场覆盖数一致", async () => {
  const coverage = await readCoverage();
  const fullyCovered = coverage.filter((lesson) => lesson.uncoveredObjectives.length === 0).length;
  const claims = claimedFullCoverageCounts(readRoadmap());

  for (const claim of claims) {
    expect({ claim, actual: fullyCovered, total: coverage.length }).toEqual({
      claim: fullyCovered,
      actual: fullyCovered,
      total: coverage.length,
    });
  }
});

test("roadmap 点名「缺哪条目标」时必须写出本课真实未覆盖的那条目标原文", async () => {
  const coverage = await readCoverage();
  const byDirectory = new Map(coverage.map((lesson) => [lesson.directory, lesson]));
  const problems: string[] = [];
  const gaps = claimedGaps(readRoadmap());

  for (const gap of gaps) {
    const lesson = byDirectory.get(gap.directory);

    if (!lesson) {
      problems.push(`roadmap 点名了 lessons/${gap.directory}/，但本课目录不存在`);
      continue;
    }

    // 点名一条实际已被覆盖的目标，会让人以为补题方向是那条；写成别的课的目标更是直接误导。
    if (!lesson.uncoveredObjectives.includes(gap.objective)) {
      problems.push(
        `${lesson.courseId}: roadmap 写缺「${gap.objective}」，但现场未覆盖的是 ` +
          `[${lesson.uncoveredObjectives.map((text) => `「${text}」`).join("、") || "无"}]`,
      );
    }
  }

  // 有课还没被考全目标时，一节课都不能漏点名；全考全了就不该再留旧缺口。
  const liveGapDirectories = coverage
    .filter((lesson) => lesson.uncoveredObjectives.length > 0)
    .map((lesson) => lesson.directory)
    .sort();
  const claimedGapDirectories = [...new Set(gaps.map((gap) => gap.directory))].sort();

  if (JSON.stringify(liveGapDirectories) !== JSON.stringify(claimedGapDirectories)) {
    problems.push(
      `roadmap 点名的缺口课 [${claimedGapDirectories.join(",")}] 与现场 [${liveGapDirectories.join(",")}] 不一致`,
    );
  }

  expect(problems).toEqual([]);
});

// `docs/feature-checklist.md` 的每课「随机选择题小测」行写着「每套从 N 道…中随机抽取 M 道」。
// 补题时最容易漏改的就是这一行：本轮给 s1-03 / s1-08 / s5-06 各补一道覆盖缺口目标的题，
// 三行题数都靠手工改。这里把它绑回现场题库，漏改一行就会失败。
test("feature-checklist 写的每课题库题数与现场题库一致", async () => {
  const coverage = await readCoverage();
  const checklist = readFileSync(`${projectRoot}/docs/feature-checklist.md`, "utf8");
  const problems: string[] = [];

  const rows = [
    ...checklist.matchAll(/^\| (S\d+-\d+) 随机选择题小测 \|[^\n]*?每套从 (\d+) 道待人工审校选择题中随机抽取 (\d+) 道/gm),
  ].map((match) => ({ courseId: match[1], bankSize: Number(match[2]), drawCount: Number(match[3]) }));

  // 抽取本身要能被验证：正则写法一变、行格式一改，下面的断言会在空数组上无声通过。
  expect(rows.length).toBe(coverage.length);

  const byCourseId = new Map(coverage.map((lesson) => [lesson.courseId, lesson]));

  for (const row of rows) {
    const lesson = byCourseId.get(row.courseId);

    if (!lesson) {
      problems.push(`feature-checklist 里有一行 ${row.courseId}，但课程数据里没有这节课`);
      continue;
    }

    if (row.bankSize !== lesson.poolSize)
      problems.push(`${row.courseId}: feature-checklist 写题库 ${row.bankSize} 道，现场是 ${lesson.poolSize} 道`);
    if (row.drawCount !== lesson.questionCount)
      problems.push(`${row.courseId}: feature-checklist 写每次抽 ${row.drawCount} 道，课程清单写的是 ${lesson.questionCount} 道`);
  }

  expect(problems).toEqual([]);
});
