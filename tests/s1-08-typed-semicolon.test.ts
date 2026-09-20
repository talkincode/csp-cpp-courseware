import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s1-08/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s1-08/index.html is missing function ${name}()`);

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
type SemiChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeSemiInput"),
    extractFunction("checkSemiFix"),
    "return checkSemiFix;",
  ].join("\n");
  return new Function(body)() as SemiChecker;
})();

test("accepts a single half-width semicolon", () => {
  expect(checker(";").ok).toBe(true);
  expect(checker("  ;  ").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("   ");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("；");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects extra characters around the semicolon", () => {
  const result = checker(";n");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("一个分号");
});
