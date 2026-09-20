import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s4-04/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s4-04/index.html is missing function ${name}()`);

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
type PruneChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizePruneInput"),
    extractFunction("checkPruneLine"),
    "return checkPruneLine;",
  ].join("\n");
  return new Function(body)() as PruneChecker;
})();

test("accepts the pruning line that stops a branch over the target", () => {
  const result = checker("if (sum > target) return;");

  expect(result.ok).toBe(true);
});

test("tolerates padding and the equivalent form of the same pruning", () => {
  expect(checker("  if ( sum > target ) return ;  ").ok).toBe(true);
  expect(checker("if (target < sum) return;").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("if （sum ＞ target） return；");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects a missing semicolon and points at the end of the statement", () => {
  const result = checker("if (sum > target) return");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("分号");
});

test("rejects a non-strict comparison and explains that hitting the target is a hit", () => {
  const result = checker("if (sum >= target) return;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("等于");
});

test("rejects the not-equal test and explains it would drop every unfinished branch", () => {
  const result = checker("if (sum != target) return;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("还没凑够");
});

test("rejects the reversed comparison and explains the numbers are positive", () => {
  const result = checker("if (sum < target) return;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("正数");
});

test("rejects break and explains it cannot leave a recursive call", () => {
  const result = checker("if (sum > target) break;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("return");
});

test("rejects adding a[i] again and explains the recursion already added it", () => {
  const result = checker("if (sum + a[i] > target) return;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("重复");
});

test("rejects comparing with n and points at the target", () => {
  const result = checker("if (sum > n) return;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("target");
});

test("rejects a condition that never checks the sum and asks for the real condition", () => {
  const result = checker("if (true) return;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("条件");
});

test("rejects a bare condition without if and parentheses", () => {
  const result = checker("sum > target;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("小括号");
});

// 同一批课里出过「一条正则漏转义导致指正分支永远不可达」的 bug，所以追加结构性约束：
// 每种错都要有自己的指正，而不是全部退化成最后那句兜底。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    "if （sum ＞ target） return；",
    "if (sum > target) return",
    "if (sum >= target) return;",
    "if (sum != target) return;",
    "if (sum < target) return;",
    "if (sum > target) break;",
    "if (sum + a[i] > target) return;",
    "if (sum > n) return;",
    "if (true) return;",
    "sum > target;",
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
