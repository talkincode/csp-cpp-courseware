import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { lessonDirectoryName, loadCurriculum } from "../scripts/curriculum";

const projectRoot = `${import.meta.dir}/..`;

// 「当前能力清单」是维护者与外部评审判断「这课到底做到哪一步」的第一手材料。
// 历史轮次漏改过它三次：S5-04/S5-05/S5-06 补完互动页与题库后整条没进清单；
// S1-03/S1-08 各补了一道覆盖缺口目标的题，正文还写着旧的 5 道；
// S3-07 起有十几课补上手写填空后，条目里仍只写「选择 + 对照」，读起来像还没做微编程。
// 抄数字的护栏拦不住这些：漏写的条目没人比对，写旧的数量也照样对得上别的课。
// 这里把每课条目的存在、题数与微练习说明全部绑回现场页面与 `courseData`。
type LessonFacts = {
  directory: string;
  courseId: string;
  poolSize: number;
  drawCount: number;
  requiresTyping: boolean;
};

function readDocument(name: string): string {
  return readFileSync(`${projectRoot}/${name}`, "utf8");
}

// 清单条目固定写成 `- **<标签>**：` 开头的一行；表格行（`| ... |`）不算。
function listItemLines(markdown: string): string[] {
  return markdown.split("\n").filter((line) => /^- \*\*.+\*\*：/.test(line));
}

// 一条条目里同时出现本课目录与本课互动页，才算「写明了这课的互动页记录」。
function interactiveRecord(lines: string[], directory: string): string | undefined {
  return lines.find(
    (line) => line.includes(`lessons/${directory}/index.html`) && /已实现/.test(line),
  );
}

// 小测条目固定写成「从 N 道待人工审校选择题中随机抽取 M 道」，一节课一条。
function quizRecord(lines: string[], courseId: string): { line: string; bank: number; draw: number } | undefined {
  for (const line of lines) {
    if (!line.includes(courseId)) continue;

    const match = line.match(/从 (\d+) 道待人工审校选择题中随机抽取 (\d+) 道/);
    if (match) return { line, bank: Number(match[1]), draw: Number(match[2]) };
  }

  return undefined;
}

async function readFacts(): Promise<LessonFacts[]> {
  const curriculum = await loadCurriculum();

  return Promise.all(
    curriculum.map(async (course) => {
      const directory = lessonDirectoryName(course.id);
      const source = await Bun.file(`${projectRoot}/lessons/${directory}/index.html`).text();
      const manifest = (await Bun.file(`${projectRoot}/lessons/${directory}/lesson.json`).json()) as {
        assessment: { questionCount: number };
      };
      const poolMatch = source.match(/const questionPool = (\[[\s\S]*?\n {6}\]);/);

      if (!poolMatch) throw new Error(`${directory}: unable to locate questionPool in index.html`);

      const pool = Function(`"use strict"; return (${poolMatch[1]});`)() as unknown[];

      // 现场事实以页面为准：有微编程输入框的课就必须在文档里写明那一处动手练习。
      const requiresTyping = /<input[^>]*class="micro-input[^"]*"/.test(source);

      return {
        directory,
        courseId: course.id,
        poolSize: pool.length,
        drawCount: manifest.assessment.questionCount,
        requiresTyping,
      };
    }),
  );
}

const facts = await readFacts();
const roadmapLines = listItemLines(readDocument("docs/roadmap.md"));

test("抽取本身有效：40 节课都读到了现场事实", () => {
  expect(facts.length).toBe(40);
  expect(roadmapLines.length).toBeGreaterThan(40);
});

test("roadmap 的当前能力清单为每节课都写了一条互动页记录", () => {
  const missing = facts
    .filter((lesson) => !interactiveRecord(roadmapLines, lesson.directory))
    .map((lesson) => lesson.directory);

  expect(missing).toEqual([]);
});

test("roadmap 每条小测记录写的题库题数、抽题数与现场一致", () => {
  const problems: string[] = [];

  for (const lesson of facts) {
    const record = quizRecord(roadmapLines, lesson.courseId);

    if (!record) {
      problems.push(`${lesson.courseId}: 清单里没有写明本课的小测抽题记录`);
      continue;
    }

    if (record.bank !== lesson.poolSize)
      problems.push(`${lesson.courseId}: 清单写题库 ${record.bank} 道，现场题库是 ${lesson.poolSize} 道`);
    if (record.draw !== lesson.drawCount)
      problems.push(`${lesson.courseId}: 清单写每次抽 ${record.draw} 道，课程清单写的是 ${lesson.drawCount} 道`);
  }

  expect(problems).toEqual([]);
});

test("页面要求动手输入时，roadmap 与 feature-checklist 都要写明那一处微练习", () => {
  const checklist = readDocument("docs/feature-checklist.md");
  const problems: string[] = [];

  for (const lesson of facts) {
    if (!lesson.requiresTyping) continue;

    const interactive = interactiveRecord(roadmapLines, lesson.directory);

    if (interactive && !interactive.includes("亲手"))
      problems.push(`${lesson.courseId}: roadmap 的互动页条目没写明本课的手写填空微练习`);

    // feature-checklist 的每课行固定写成 `| <课程 ID> 引导式互动课件 | ... |`。
    const row = checklist.split("\n").find((line) => line.startsWith(`| ${lesson.courseId} 引导式互动课件 |`));

    if (!row) {
      problems.push(`${lesson.courseId}: feature-checklist 里没有本课的互动课件行`);
      continue;
    }

    if (!row.includes("亲手"))
      problems.push(`${lesson.courseId}: feature-checklist 的互动课件行没写明本课的手写填空微练习`);
  }

  expect(problems).toEqual([]);
});
