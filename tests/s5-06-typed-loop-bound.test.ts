import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s5-06/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s5-06/index.html is missing function ${name}()`);

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
type LoopBoundChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeLoopBoundInput"),
    extractFunction("checkLoopBoundLine"),
    "return checkLoopBoundLine;",
  ].join("\n");
  return new Function(body)() as LoopBoundChecker;
})();

test("accepts the loop bound that reaches the last element", () => {
  expect(checker("i <= n").ok).toBe(true);
  expect(checker("i<=n").ok).toBe(true);
});

test("tolerates padding around the typed condition", () => {
  expect(checker("   i <= n   ").ok).toBe(true);
  expect(checker("i   <=   n").ok).toBe(true);
});

test("stays quiet about a complete condition", () => {
  const result = checker("i <= n");

  expect(result.ok).toBe(true);
  expect(result.message).toBe("");
});

test("rejects an empty box with a nudge to write the loop bound", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("循环");
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("i ＜= n");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects i < n and names the bug that cost this round's points", () => {
  const result = checker("i < n");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("最后一个");
});

test("rejects i <= n - 1 as the same missing element in another spelling", () => {
  const result = checker("i <= n - 1");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("一回事");
});

test("rejects i + 1 <= n as the same missing element in another spelling", () => {
  const result = checker("i + 1 <= n");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("一回事");
});

test("rejects a bound past n and explains the unread cell", () => {
  const result = checker("i <= n + 1");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("多走");
});

test("rejects a reversed condition and explains the loop never runs", () => {
  const result = checker("i > n");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("方向反了");
});

test("rejects a single equals sign in the condition", () => {
  const result = checker("i = n");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("赋值");
});

test("rejects a semicolon inside the for condition", () => {
  const result = checker("i <= n;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("分号");
});

test("rejects comparing an array element instead of the index", () => {
  const result = checker("a[i] <= n");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("下标");
});

test("rejects hard-coding the array size instead of the input n", () => {
  const result = checker("i <= 105");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("数组大小");
});

test("falls back to the canonical condition when the box holds something else", () => {
  const result = checker("j <= m");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("i <= n");
});

// 同一批课里出过「一条正则漏转义导致指正分支永远不可达」的 bug，所以追加结构性约束：
// 每种错都要有自己的指正，而不是全部退化成最后那句兜底。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    "i ＜= n",
    "i < n",
    "i <= n - 1",
    "i + 1 <= n",
    "i <= n + 1",
    "i > n",
    "i = n",
    "i <= n;",
    "a[i] <= n",
    "i <= 105",
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
