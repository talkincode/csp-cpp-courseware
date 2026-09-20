import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s2-01/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s2-01/index.html is missing function ${name}()`);

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
type IndexChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeIndexInput"),
    extractFunction("checkLastIndexFix"),
    "return checkLastIndexFix;",
  ].join("\n");
  return new Function(body)() as IndexChecker;
})();

test("accepts the general form a[n - 1]", () => {
  const result = checker("a[n - 1]");

  expect(result.ok).toBe(true);
});

test("accepts a[n-1] without spaces and tolerates outer padding", () => {
  expect(checker("a[n-1]").ok).toBe(true);
  expect(checker("  a[n - 1]  ").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("   ");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width brackets and asks for half-width input", () => {
  const result = checker("a［n - 1］");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects a[n] and explains the out-of-bounds index", () => {
  const result = checker("a[n]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("越界");
});

test("rejects a[n + 1] and explains it is even further out of bounds", () => {
  const result = checker("a[n + 1]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("越界");
});

test("rejects a hard-coded number and asks for the n - 1 form", () => {
  const result = checker("a[3]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("n - 1");
});

test("rejects a[1] as the last element", () => {
  const result = checker("a[1]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("n - 1");
});

test("rejects a bare name or a missing bracket instead of silently passing", () => {
  for (const raw of ["a", "a()", "n - 1", "a[]"]) {
    expect(checker(raw).ok).toBe(false);
  }
});
