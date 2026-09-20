import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s4-08/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s4-08/index.html is missing function ${name}()`);

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
type FallbackChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeFallbackInput"),
    extractFunction("checkFallbackBranch"),
    "return checkFallbackBranch;",
  ].join("\n");
  return new Function(body)() as FallbackChecker;
})();

test("accepts the fallback branch that scores the first subtask and stops", () => {
  const result = checker("if (n <= 1000) { cout << brute(n); return 0; }");

  expect(result.ok).toBe(true);
});

test("tolerates padding and the equivalent upper bound written as n < 1001", () => {
  expect(checker("  if ( n <= 1000 ) { cout << brute(n); return 0; }  ").ok).toBe(true);
  expect(checker("if (n < 1001) { cout << brute(n); return 0; }").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("if（n ＜= 1000）｛cout ＜＜ brute（n）；return 0；｝");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects missing semicolons and names the two statements that need them", () => {
  const result = checker("if (n <= 1000) { cout << brute(n) return 0 }");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("分号");
});

test("rejects a fallback branch that forgets to stop the program", () => {
  const result = checker("if (n <= 1000) { cout << brute(n); }");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("return 0;");
});

test("rejects a branch without braces and explains the two statements need grouping", () => {
  const result = checker("if (n <= 1000) cout << brute(n); return 0;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("花括号");
});

test("rejects printing after returning and explains the order of the two statements", () => {
  const result = checker("if (n <= 1000) { return 0; cout << brute(n); }");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("顺序");
});

test("rejects a reversed comparison and restates the subtask bound", () => {
  const result = checker("if (n >= 1000) { cout << brute(n); return 0; }");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("方向");
});

test("rejects the second subtask bound and explains brute force would time out", () => {
  const result = checker("if (n <= 100000) { cout << brute(n); return 0; }");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("10 万");
});

test("rejects a strict bound and explains 1000 itself belongs to the subtask", () => {
  const result = checker("if (n < 1000) { cout << brute(n); return 0; }");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("包含");
});

test("rejects a made-up bound and points back at the subtask range", () => {
  const result = checker("if (n <= 100) { cout << brute(n); return 0; }");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("1000");
});

test("rejects the unfinished fast solution and explains it is not the fallback", () => {
  const result = checker("if (n <= 1000) { cout << fast(n); return 0; }");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("保底");
});

test("rejects a while loop and explains the range only needs checking once", () => {
  const result = checker("while (n <= 1000) { cout << brute(n); return 0; }");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("while");
});

test("rejects a branch without any range check", () => {
  const result = checker("cout << brute(n); return 0;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("范围");
});

// 同一批课里出过「一条正则漏转义导致指正分支永远不可达」的 bug，所以追加结构性约束：
// 每种错都要有自己的指正，而不是全部退化成最后那句兜底。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    "if（n ＜= 1000）｛cout ＜＜ brute（n）；return 0；｝",
    "if (n <= 1000) { cout << brute(n) return 0 }",
    "if (n <= 1000) { cout << brute(n); }",
    "if (n <= 1000) cout << brute(n); return 0;",
    "if (n <= 1000) { return 0; cout << brute(n); }",
    "if (n >= 1000) { cout << brute(n); return 0; }",
    "if (n <= 100000) { cout << brute(n); return 0; }",
    "if (n < 1000) { cout << brute(n); return 0; }",
    "if (n <= 100) { cout << brute(n); return 0; }",
    "if (n <= 1000) { cout << fast(n); return 0; }",
    "while (n <= 1000) { cout << brute(n); return 0; }",
    "cout << brute(n); return 0;",
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
