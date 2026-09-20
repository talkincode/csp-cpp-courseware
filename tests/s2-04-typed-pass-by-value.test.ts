import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s2-04/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s2-04/index.html is missing function ${name}()`);

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
type ParamChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeParamInput"),
    extractFunction("checkPassByValueFix"),
    "return checkPassByValueFix;",
  ].join("\n");
  return new Function(body)() as ParamChecker;
})();

test("accepts the by-value parameter int x", () => {
  const result = checker("int x");

  expect(result.ok).toBe(true);
});

test("tolerates extra spacing inside the parameter", () => {
  expect(checker("  int   x  ").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("   ");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width punctuation and asks for half-width input", () => {
  for (const raw of ["int x；", "int＆x"]) {
    const result = checker(raw);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("半角");
  }
});

test("tolerates an ideographic space typed by a Chinese IME", () => {
  expect(checker("int　x").ok).toBe(true);
});

test("rejects a reference parameter and explains it would change the outer n", () => {
  const result = checker("int &x");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("引用");
});

test("rejects a pointer parameter and marks it as extension knowledge", () => {
  const result = checker("int *x");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("指针");
});

test("rejects a parameter name that does not match the body", () => {
  const result = checker("int n");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("x");
});

test("rejects a bare name without a type", () => {
  const result = checker("x");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("int");
});

test("rejects pasting the whole signature instead of just the parameter", () => {
  const result = checker("addOne(int x)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("形参");
});
