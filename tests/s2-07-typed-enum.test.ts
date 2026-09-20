import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s2-07/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s2-07/index.html is missing function ${name}()`);

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
type EnumChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [extractFunction("normalizeEnumInput"), extractFunction("checkEnumFix"), "return checkEnumFix;"].join(
    "\n",
  );
  return new Function(body)() as EnumChecker;
})();

test("accepts guarding the counter and bumping it for even numbers", () => {
  const result = checker("if (i % 2 == 0) evenCount++;");

  expect(result.ok).toBe(true);
});

test("also accepts a written-out increment inside the guard", () => {
  expect(checker("if (i % 2 == 0) evenCount = evenCount + 1;").ok).toBe(true);
});

test("tolerates braces, padding and inner spaces", () => {
  expect(checker("  if ( i % 2 == 0 ) { evenCount++; }  ").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("   ");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("if（i ％ 2 == 0）evenCount＋＋；");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects dropping the guard and explains it counts the odd numbers too", () => {
  const result = checker("evenCount++;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("漏分支");
});

test("rejects integer division and explains 3 / 2 is not 0", () => {
  const result = checker("if (i / 2 == 0) evenCount++;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("取模");
});

test("rejects the odd-number condition and points back at even numbers", () => {
  const result = checker("if (i % 2 == 1) evenCount++;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("奇数");
});

test("rejects a single equals sign and asks for the comparison operator", () => {
  const result = checker("if (i % 2 = 0) evenCount++;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("两个等号");
});

test("rejects a missing semicolon and names the missing character", () => {
  const result = checker("if (i % 2 == 0) evenCount++");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("分号");
});

test("rejects bumping another variable and names evenCount", () => {
  const result = checker("if (i % 2 == 0) i++;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("evenCount");
});

test("rejects a missing if body and asks for the braces and condition", () => {
  const result = checker("if i % 2 == 0");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("小括号");
});
