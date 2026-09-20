import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s1-02/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s1-02/index.html is missing function ${name}()`);

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
type UpdateChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeUpdateLine"),
    extractFunction("checkUpdateLine"),
    "return checkUpdateLine;",
  ].join("\n");
  return new Function(body)() as UpdateChecker;
})();

test("accepts the update statement the lesson asks for", () => {
  expect(checker("score = score + 15;").ok).toBe(true);
  expect(checker("  score=score+15;  ").ok).toBe(true);
});

test("rejects == and explains assignment", () => {
  const result = checker("score == score + 15;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("单个 =");
});

test("rejects a missing semicolon", () => {
  const result = checker("score = score + 15");

  expect(result.ok).toBe(false);
  expect(result.message).toContain(";");
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("score ＝ score ＋ 15；");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects a wrong number", () => {
  const result = checker("score = score + 5;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("15");
});
