import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s1-05/index.html`;
const source = await Bun.file(lessonPath).text();

// The checker lives inside the lesson's inline script, where it runs in the
// learner's browser. Extracting it here lets bun test verify the feedback a
// beginner actually receives instead of only pattern-matching strings.
function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s1-05/index.html is missing function ${name}()`);

  const bodyStart = source.indexOf("{", start);
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error(`function ${name}() is not closed`);
}

type CheckResult = { ok: boolean; message: string };
type ConditionChecker = (raw: string, target: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeCode"),
    extractFunction("checkSingleCondition"),
    "return checkSingleCondition;",
  ].join("\n");
  return new Function(body)() as ConditionChecker;
})();

type MicroOutcome = {
  solved: boolean;
  problem: { label: string; message: string } | null;
};

const evaluateMicro = (() => {
  const body = [
    extractFunction("normalizeCode"),
    extractFunction("checkSingleCondition"),
    extractFunction("evaluateMicroConditions"),
    "return evaluateMicroConditions;",
  ].join("\n");
  return new Function(body)() as (first: string, second: string) => MicroOutcome;
})();

test("accepts the two boundary conditions the lesson asks for", () => {
  expect(checker("score >= 90", "score>=90").ok).toBe(true);
  expect(checker("score>=60", "score>=60").ok).toBe(true);
  expect(checker("  score  >=  90  ", "score>=90").ok).toBe(true);
  expect(checker("if (score >= 90)", "score>=90").ok).toBe(true);
});

test("rejects a strict comparison and explains the boundary", () => {
  const result = checker("score > 90", "score>=90");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("包含等于");
});

test("treats a single = as assignment rather than a question", () => {
  const result = checker("score = 90", "score>=90");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("=");
  expect(result.message).toContain("放进变量");
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("score >= 90；", "score>=90");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects 900 when the expected boundary is 90", () => {
  const result = checker("score >= 900", "score>=90");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("数字");
});

test("asks for a condition before checking an empty box", () => {
  const result = checker("   ", "score>=90");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("points out uppercase variable names", () => {
  const result = checker("SCORE >= 90", "score>=90");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("小写");
});

test("solves the task only when both boundary conditions are written", () => {
  expect(evaluateMicro("score >= 90", "score >= 60").solved).toBe(true);
  expect(evaluateMicro("score >= 90", "score >= 60").problem).toBe(null);
  expect(evaluateMicro("score >= 90", "score >= 6").solved).toBe(false);
});

test("reports the first unfinished box with a beginner-readable reason", () => {
  const wrongFirst = evaluateMicro("score > 90", "score >= 60");
  const wrongSecond = evaluateMicro("score >= 90", "score = 60");

  expect(wrongFirst.solved).toBe(false);
  expect(wrongFirst.problem?.label).toContain("第一空");
  expect(wrongFirst.problem?.message).toContain("包含等于");
  expect(wrongSecond.solved).toBe(false);
  expect(wrongSecond.problem?.label).toContain("第二空");
  expect(wrongSecond.problem?.message).toContain("放进变量");
});
