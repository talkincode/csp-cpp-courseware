import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { lessonFlows } from "./e2e/lesson-flows.ts";

// 历史轮次反复漏改过 `bun run e2e:flow` 的项数：脚本加了检查（17 → 19）或换了覆盖范围
// （17 课 → 39 课），docstring、速查清单、README 与验收矩阵里的旧数字却留着，读文档的人
// 会拿到过期事实。这里把文档里的数字绑回脚本自己的声明，改漏任何一处都当场失败。
//
// 只认「当前事实」的句子：各课的「自动化复验记录」表记的是那次复验当天的脚本覆盖范围，
// 旧数字在那里是正确的历史记录，不参与本文件的校验。
const projectRoot = `${import.meta.dir}/..`;
const flowScript = "tests/e2e/flow-cdp.ts";

function read(document: string): string {
  return readFileSync(`${projectRoot}/${document}`, "utf8");
}

/** 脚本自称每课跑几项；它跑完会拿这个数字自查，声明与实跑不符就直接失败。 */
function checksPerLesson(): number {
  const match = read(flowScript).match(/const checksPerLesson\s*=\s*(\d+)/);
  if (!match) throw new Error(`${flowScript} 里找不到 checksPerLesson 声明`);
  return Number(match[1]);
}

/** S1-01 不在这张表里：它的七个场景由 `s1-01-cdp.ts` 单独复验。 */
function coveredLessons(): number {
  return lessonFlows.length;
}

type Claims = { perLesson: number[]; total: number[] };

function collect(source: string): Claims {
  const perLesson: number[] = [];
  const total: number[] = [];

  for (const match of source.matchAll(/每课\s*(\d+)\s*项/g)) perLesson.push(Number(match[1]));
  for (const match of source.matchAll(/共\s*(\d+)\s*项|(?<![\d/])(\d+)\s*项检查/g)) {
    total.push(Number(match[1] ?? match[2]));
  }

  return { perLesson, total };
}

/**
 * 只认 `e2e:flow` 后面那一小段里的数字，并截到下一个脚本名之前。
 * 同一句里常常同时写 `e2e:typed`（659 项）与 `e2e:flow`（741 项），不切开就会张冠李戴。
 */
function flowContextClaims(document: string): Claims[] {
  const source = read(document);
  const contexts: Claims[] = [];

  for (const match of source.matchAll(/e2e:flow(?![\w:])/g)) {
    const start = match.index + match[0].length;
    const window = source.slice(start, start + 320);
    contexts.push(collect(window.split(/e2e:[a-z0-9-]+/)[0]));
  }

  return contexts;
}

const proseDocuments = [
  "tests/e2e/manual-checklist.md",
  "docs/roadmap.md",
  "docs/feature-checklist.md",
  "README.md",
];

test("每个 e2e:flow 段落写的每课项数与 checksPerLesson 一致", () => {
  const actual = checksPerLesson();
  expect(actual).toBeGreaterThan(0);

  for (const document of proseDocuments) {
    const contexts = flowContextClaims(document);
    expect({ document, hasContext: contexts.length > 0 }).toEqual({ document, hasContext: true });

    for (const context of contexts) {
      for (const claim of context.perLesson) {
        expect({ document, claim }).toEqual({ document, claim: actual });
      }
    }
  }
});

test("每个 e2e:flow 段落写的整段项数与「课程数 × 每课项数」一致", () => {
  const actual = checksPerLesson() * coveredLessons();

  for (const document of proseDocuments) {
    for (const context of flowContextClaims(document)) {
      for (const claim of context.total) {
        expect({ document, claim }).toEqual({ document, claim: actual });
      }
    }
  }
});

test("flow-cdp.ts docstring 里的数字与 checksPerLesson 一致", () => {
  const source = read(flowScript);
  const { perLesson, total } = collect(source);
  const wholeRun = checksPerLesson() * coveredLessons();

  expect(perLesson.length).toBeGreaterThan(0);
  expect(total.length).toBeGreaterThan(0);
  for (const claim of perLesson) expect(claim).toBe(checksPerLesson());
  for (const claim of total) expect(claim).toBe(wholeRun);

  expect(source).toContain("全部三十九课");
});

test("39 节已迁移课每课都写了本课占几项，数字与 checksPerLesson 一致", () => {
  const actual = checksPerLesson();
  const wholeRun = checksPerLesson() * coveredLessons();

  for (const lesson of lessonFlows) {
    const document = `tests/e2e/${lesson.directory}-manual-checklist.md`;
    const source = read(document);

    const claimed = source.match(/本课占\s*(\d+)\s*项/);
    if (!claimed) throw new Error(`${document} 里找不到「本课占 N 项」`);
    expect({ document, claim: Number(claimed[1]) }).toEqual({ document, claim: actual });

    // 记录 flow 复验的那一行必须同时说清本课项数与整段总数。
    const row = source.split("\n").find((line) => line.includes("flow-cdp.ts"));
    if (!row) throw new Error(`${document} 的自动化复验记录里找不到 flow-cdp.ts 那一行`);
    expect({ document, hasPerLesson: row.includes(`本课 ${actual} 项`) }).toEqual({ document, hasPerLesson: true });
    expect({ document, hasWholeRun: row.includes(`全程 ${wholeRun}/${wholeRun}`) }).toEqual({
      document,
      hasWholeRun: true,
    });
  }
});

test("flow 清单的固定项编号与每课项数对齐，且没有重号", () => {
  const actual = checksPerLesson();
  const document = "tests/e2e/flow-manual-checklist.md";
  const source = read(document);

  const heading = source.match(/## 每课固定复验的\s*(\d+)\s*项/);
  if (!heading) throw new Error(`${document} 里找不到「每课固定复验的 N 项」标题`);
  expect(Number(heading[1])).toBe(actual);

  // 编号只取标题之后、下一个二级标题之前的那一段，避免把场景步骤也算进来。
  const section = source.slice(heading.index! + heading[0].length).split(/\n##\s/)[0];
  const numbers = [...section.matchAll(/^\s*(\d+)\.\s/gm)].map((entry) => Number(entry[1]));
  expect(numbers).toEqual(Array.from({ length: actual }, (_, index) => index + 1));
});

test("flow 清单的自动化复验记录保留历史结果，并新增本轮的整段结果", () => {
  const document = "tests/e2e/flow-manual-checklist.md";
  const rows = read(document)
    .split("\n")
    .filter((line) => line.startsWith("|") && line.includes("flow-cdp.ts"));
  const wholeRun = checksPerLesson() * coveredLessons();

  expect(rows.length).toBeGreaterThanOrEqual(2);
  expect(rows[rows.length - 1]).toContain(`${wholeRun}/${wholeRun} 项检查通过`);
  // 表里沿用「39 课各 N 项」的写法，与 docstring 的「每课 N 项」等价。
  expect(rows[rows.length - 1]).toContain(`各 ${checksPerLesson()} 项`);
});
