import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s3-03/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s3-03/index.html is missing function ${name}()`);

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
type MidChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [extractFunction("normalizeMidInput"), extractFunction("checkMidFix"), "return checkMidFix;"].join("\n");
  return new Function(body)() as MidChecker;
})();

test("accepts adding both bounds and halving them", () => {
  const result = checker("(left + right) / 2");

  expect(result.ok).toBe(true);
});

test("accepts the overflow-safe midpoint and says why it is fine", () => {
  const result = checker("left + (right - left) / 2");

  expect(result.ok).toBe(true);
  expect(result.message).toContain("拓展");
});

test("tolerates padding and a trailing semicolon", () => {
  expect(checker("  ( left  +  right )  /  2  ;").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width parentheses and asks for the half-width pair", () => {
  const result = checker("（left + right） / 2");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects a missing pair of parentheses and explains the precedence", () => {
  const result = checker("left + right / 2");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("括号");
});

test("rejects doubling and explains the midpoint sits between the bounds", () => {
  const result = checker("(left + right) * 2");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("中间");
});

test("rejects subtracting the bounds and explains it is the half of a gap", () => {
  const result = checker("(left - right) / 2");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("相加");
});

test("rejects stopping at the sum and asks for the division by two", () => {
  const result = checker("(left + right)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("/ 2");
});
