import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s1-07/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s1-07/index.html is missing function ${name}()`);

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
type LoopChecker = (raw: string, varName: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeLoopHeader"),
    extractFunction("checkLoopHeader"),
    "return checkLoopHeader;",
  ].join("\n");
  return new Function(body)() as LoopChecker;
})();

test("accepts the inner column loop the lesson asks for", () => {
  expect(checker("for (int c = 1; c <= n; c++)", "c").ok).toBe(true);
  expect(checker("for(int c=1;c<=n;c++)", "c").ok).toBe(true);
});

test("rejects the row variable in the column loop", () => {
  const result = checker("for (int r = 1; r <= n; r++)", "c");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("c");
});

test("rejects a trailing semicolon that would spin empty", () => {
  const result = checker("for (int c = 1; c <= n; c++);", "c");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("空转");
});

test("rejects a strict bound and explains the boundary", () => {
  const result = checker("for (int c = 1; c < n; c++)", "c");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("n 也要进去");
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("for（int c ＝ 1； c ＜＝ n； c＋＋）", "c");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});
