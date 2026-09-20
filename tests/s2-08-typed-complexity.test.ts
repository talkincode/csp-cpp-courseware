import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s2-08/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s2-08/index.html is missing function ${name}()`);

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
type OpsChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [extractFunction("normalizeOpsInput"), extractFunction("checkOpsFix"), "return checkOpsFix;"].join("\n");
  return new Function(body)() as OpsChecker;
})();

test("accepts multiplying the two loop lengths", () => {
  const result = checker("n * n");

  expect(result.ok).toBe(true);
});

test("tolerates padding and a trailing semicolon", () => {
  expect(checker("  n  *  n  ;").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width symbols and asks for the half-width multiplier", () => {
  const result = checker("n ＊ n");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects adding the two loops and explains nesting multiplies", () => {
  const result = checker("n + n");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("相乘");
});

test("rejects counting a single layer and says a second one is nested", () => {
  const result = checker("n");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("一层");
});

test("rejects the xor operator and explains it is not a power", () => {
  const result = checker("n ^ 2");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("异或");
});

test("rejects a third nested layer", () => {
  const result = checker("n * n * n");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("三层");
});

test("rejects hard-coded numbers and asks for the expression in n", () => {
  const result = checker("1000 * 1000");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("用 n");
});

test("rejects a side-by-side doubling of one loop", () => {
  const result = checker("2 * n");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("乘 n");
});
