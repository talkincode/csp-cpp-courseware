import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s3-08/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s3-08/index.html is missing function ${name}()`);

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
type DpChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeDpInput"),
    extractFunction("checkDpTransition"),
    "return checkDpTransition;",
  ].join("\n");
  return new Function(body)() as DpChecker;
})();

test("accepts the climbing-stairs transition", () => {
  const result = checker("dp[i] = dp[i - 1] + dp[i - 2]");

  expect(result.ok).toBe(true);
});

test("tolerates padding and a trailing semicolon", () => {
  expect(checker("  dp[i] = dp[i - 1] + dp[i - 2] ;  ").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width brackets and equals sign and asks for half-width", () => {
  const result = checker("dp［i］＝dp［i－1］＋dp［i－2］");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects multiplying the two ways and asks for a sum", () => {
  const result = checker("dp[i] = dp[i - 1] * dp[i - 2]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("相加");
});

test("rejects using i - 1 twice and reminds that i - 2 is also a way in", () => {
  const result = checker("dp[i] = dp[i - 1] + dp[i - 1]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("i - 2");
});

test("rejects reading dp[i] before it is filled", () => {
  const result = checker("dp[i] = dp[i] + dp[i - 1]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("先算好");
});

test("rejects writing dp[i + 1] and explains the loop variable is i", () => {
  const result = checker("dp[i + 1] = dp[i] + dp[i - 1]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("dp[i]");
});

test("rejects an extra +1 and explains the stairs have no extra case", () => {
  const result = checker("dp[i] = dp[i - 1] + dp[i - 2] + 1");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("+ 1");
});
