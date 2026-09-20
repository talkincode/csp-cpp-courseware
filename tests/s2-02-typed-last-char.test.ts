import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s2-02/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s2-02/index.html is missing function ${name}()`);

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
type CharChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeIndexInput"),
    extractFunction("checkLastCharFix"),
    "return checkLastCharFix;",
  ].join("\n");
  return new Function(body)() as CharChecker;
})();

test("accepts the general form s[n - 1]", () => {
  const result = checker("s[n - 1]");

  expect(result.ok).toBe(true);
});

test("accepts s[n-1] without spaces and tolerates outer padding", () => {
  expect(checker("s[n-1]").ok).toBe(true);
  expect(checker("  s[n - 1]  ").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width brackets and asks for half-width input", () => {
  const result = checker("s［n - 1］");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects s[n] and explains the out-of-bounds index", () => {
  const result = checker("s[n]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("越界");
});

test("rejects a hard-coded number and asks for the n - 1 form", () => {
  const result = checker("s[2]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("n - 1");
});

test("rejects s[0] because the first character is not the last one", () => {
  const result = checker("s[0]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("n - 1");
});

test("rejects a bare name or a missing bracket instead of silently passing", () => {
  for (const raw of ["s", "s()", "n - 1", "s[]"]) {
    expect(checker(raw).ok).toBe(false);
  }
});
