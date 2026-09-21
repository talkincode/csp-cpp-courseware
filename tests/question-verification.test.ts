import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// 题库从「待人工审校」转为「已通过机器校验」以后，最容易退化的不是答案本身，而是**证据**：
// 有人改了题干或挪了选项，证据却还是旧的，页面继续写着「已通过校验」。这里把证据与题目内容
// 哈希绑定：题目一动，证据作废，bun test 当场失败，必须重新校验并更新 docs/review。
// 同时守住这轮修掉的真实缺陷——215 道题的正确答案曾经全部排在第 1 个选项。
const projectRoot = `${import.meta.dir}/..`;
const lessonsRoot = resolve(projectRoot, "lessons");
const evidencePath = resolve(projectRoot, "docs/review/question-verification.json");

type Question = { id: string; prompt: string; options: string[]; answer: number };
type Evidence = {
  generatedAt: string;
  methods: string[];
  limitations: string[];
  findings: { id: string; issue: string; fix: string }[];
  questions: { id: string; answer: number; contentHash: string; verdict: string }[];
};

const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as Evidence;

function lessonDirectories(): string[] {
  return readdirSync(lessonsRoot)
    .filter((name) => /^s\d-\d\d$/.test(name))
    .sort();
}

function questionPool(directory: string): Question[] {
  const source = readFileSync(resolve(lessonsRoot, directory, "index.html"), "utf8");
  const match = source.match(/const questionPool = (\[[\s\S]*?\n {6}\]);/);
  if (!match) throw new Error(`${directory} 里找不到 questionPool`);
  return new Function(`return ${match[1]};`)() as Question[];
}

function contentHash(question: Question): string {
  return createHash("sha256")
    .update([question.id, question.prompt, ...question.options, String(question.answer)].join("\u0000"))
    .digest("hex")
    .slice(0, 16);
}

test("每道题都有校验证据，且证据与题干、选项顺序、答案逐项绑定", () => {
  const recorded = new Map(evidence.questions.map((entry) => [entry.id, entry]));
  const problems: string[] = [];
  let seen = 0;

  for (const directory of lessonDirectories()) {
    for (const question of questionPool(directory)) {
      const id = `${directory}/${question.id}`;
      const entry = recorded.get(id);
      seen += 1;

      if (!entry) {
        problems.push(`${id}: 没有校验证据`);
        continue;
      }
      if (entry.answer !== question.answer) problems.push(`${id}: 证据里的答案下标与现场不符`);
      if (entry.contentHash !== contentHash(question)) {
        problems.push(`${id}: 题目改过了，证据已作废（重新校验后更新 ${evidencePath.slice(projectRoot.length + 1)}）`);
      }
      if (entry.verdict !== "agrees") problems.push(`${id}: 证据结论是 ${entry.verdict}`);
    }
  }

  for (const entry of evidence.questions) {
    if (!entry.id.startsWith("全部") && !seen) problems.push(`${entry.id}: 证据里多出一条现场没有的题`);
  }
  expect(seen).toBe(evidence.questions.length);
  expect(problems).toEqual([]);
});

test("证据必须写明它不是人工审校", () => {
  expect(evidence.methods.length).toBeGreaterThan(0);
  expect(evidence.limitations.join("\n")).toContain("人工");
  expect(evidence.findings.length).toBeGreaterThan(0);
});

test("正确答案的位置不得集中在同一个选项上", () => {
  const counts = [0, 0, 0, 0];
  const problems: string[] = [];
  let total = 0;

  for (const directory of lessonDirectories()) {
    const positions = new Set<number>();

    for (const question of questionPool(directory)) {
      counts[question.answer] += 1;
      positions.add(question.answer);
      total += 1;
    }

    // 每课至少用到 3 个不同位置，否则一节 5 道题的卷子又会露出「答案都在同一个位置」的马脚。
    if (positions.size < 3) problems.push(`${directory}: 正确答案只落在 ${positions.size} 个位置上`);
  }

  for (const [position, count] of counts.entries()) {
    if (count / total < 0.15) problems.push(`第 ${position + 1} 个选项只承载了 ${count} 道题的答案`);
  }

  expect(total).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});
