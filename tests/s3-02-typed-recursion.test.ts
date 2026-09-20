import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s3-02/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s3-02/index.html is missing function ${name}()`);

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
type FactChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [extractFunction("normalizeFactInput"), extractFunction("checkFactFix"), "return checkFactFix;"].join("\n");
  return new Function(body)() as FactChecker;
})();

test("accepts multiplying the current n by the smaller problem", () => {
  const result = checker("n * fact(n - 1)");

  expect(result.ok).toBe(true);
});

test("accepts the same multiplication with the factors swapped", () => {
  expect(checker("fact(n - 1) * n").ok).toBe(true);
});

test("tolerates padding and a trailing semicolon", () => {
  expect(checker("  n  *  fact( n - 1 )  ;").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width parentheses and asks for the half-width pair", () => {
  const result = checker("n * fact（n - 1）");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects calling with the same n and explains it never reaches the boundary", () => {
  const result = checker("n * fact(n)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("边界");
});

test("rejects the missing multiplication and says the current layer was dropped", () => {
  const result = checker("fact(n - 1)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("乘");
});

test("rejects skipping a layer and explains the step is exactly one", () => {
  const result = checker("n * fact(n - 2)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("1");
});

test("rejects addition and explains factorial multiplies", () => {
  const result = checker("n + fact(n - 1)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("乘");
});

test("rejects a plain product that never calls the function again", () => {
  const result = checker("n * n");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("fact");
});
