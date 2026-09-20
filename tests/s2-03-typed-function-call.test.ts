import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s2-03/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s2-03/index.html is missing function ${name}()`);

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
type CallChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeCallInput"),
    extractFunction("checkCallFix"),
    "return checkCallFix;",
  ].join("\n");
  return new Function(body)() as CallChecker;
})();

test("accepts the call isEven(4)", () => {
  const result = checker("isEven(4)");

  expect(result.ok).toBe(true);
});

test("tolerates spaces around the call and its argument", () => {
  expect(checker("  isEven( 4 )  ").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("   ");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width parentheses and asks for half-width input", () => {
  const result = checker("isEven（4）");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects the definition and explains this blank wants a call", () => {
  const result = checker("bool isEven(int x) { return x % 2 == 0; }");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("定义");
});

test("rejects a bare function name without parentheses", () => {
  const result = checker("isEven");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("括号");
});

test("rejects a lowercase function name and points at the case mismatch", () => {
  const result = checker("iseven(4)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("大小写");
});

test("rejects another argument and asks for the 4 from the minimal example", () => {
  const result = checker("isEven(5)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("4");
});
