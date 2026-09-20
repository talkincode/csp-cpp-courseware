import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s1-01/index.html`;
const source = await Bun.file(lessonPath).text();

// The checker lives inside the lesson's inline script, where it runs in the
// learner's browser. Extracting it here lets bun test verify the feedback a
// beginner actually receives instead of only pattern-matching strings.
function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s1-01/index.html is missing function ${name}()`);

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
type SemicolonChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeSemicolonInput"),
    extractFunction("checkSemicolonFix"),
    "return checkSemicolonFix;",
  ].join("\n");
  return new Function(body)() as SemicolonChecker;
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
  const result = checker(";;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("一个分号");
});

test("rejects input without any semicolon", () => {
  const result = checker("cout");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角分号");
});
