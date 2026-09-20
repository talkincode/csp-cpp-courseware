import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s1-03/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s1-03/index.html is missing function ${name}()`);

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
type AvgChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeAvgExpression"),
    extractFunction("checkAvgExpression"),
    "return checkAvgExpression;",
  ].join("\n");
  return new Function(body)() as AvgChecker;
})();

test("accepts the average expression the lesson asks for", () => {
  expect(checker("(a + b) / 2").ok).toBe(true);
  expect(checker("(a+b)/2").ok).toBe(true);
});

test("rejects a missing parenthesis and explains precedence", () => {
  const result = checker("a + b / 2");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("括号");
});

test("rejects multiplication instead of addition", () => {
  const result = checker("a * b / 2");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("相乘");
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("（a ＋ b） ／ 2");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("asks for an expression before checking an empty box", () => {
  const result = checker("   ");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});
