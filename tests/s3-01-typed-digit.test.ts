import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s3-01/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s3-01/index.html is missing function ${name}()`);

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
type DigitChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [extractFunction("normalizeDigitInput"), extractFunction("checkDigitFix"), "return checkDigitFix;"].join("\n");
  return new Function(body)() as DigitChecker;
})();

test("accepts taking the units digit with the remainder", () => {
  const result = checker("x % 10");

  expect(result.ok).toBe(true);
});

test("tolerates padding and a trailing semicolon", () => {
  expect(checker("  x  %  10  ;").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width symbols and asks for the half-width percent", () => {
  const result = checker("x ％ 10");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects dividing by ten and explains that removes the digit", () => {
  const result = checker("x / 10");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("去掉个位");
});

test("rejects a remainder of one hundred and explains it keeps two digits", () => {
  const result = checker("x % 100");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("两位");
});

test("rejects multiplying and explains the number would grow", () => {
  const result = checker("x * 10");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("变大");
});

test("rejects a remainder of two and asks for base ten", () => {
  const result = checker("x % 2");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("10");
});

test("rejects a bare remainder operator and asks for the divisor", () => {
  const result = checker("x %");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("10");
});
