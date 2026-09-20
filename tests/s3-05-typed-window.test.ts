import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s3-05/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s3-05/index.html is missing function ${name}()`);

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
type WindowChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeWindowInput"),
    extractFunction("checkWindowMove"),
    "return checkWindowMove;",
  ].join("\n");
  return new Function(body)() as WindowChecker;
})();

test("accepts moving the right end first and then folding the new cell into the sum", () => {
  const result = checker("right++; sum += a[right];");

  expect(result.ok).toBe(true);
});

test("tolerates padding and a missing trailing semicolon", () => {
  expect(checker("  right++ ; sum+=a[right] ").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width plus, semicolon and brackets and asks for half-width", () => {
  const result = checker("right＋＋； sum ＋＝ a［right］；");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects folding the new cell in before moving and explains the stale end point", () => {
  const result = checker("sum += a[right]; right++;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("顺序反了");
});

test("rejects subtracting and explains shrinking is the other step", () => {
  const result = checker("right++; sum -= a[right];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("减");
});

test("rejects folding in the left end and explains which pointer is new", () => {
  const result = checker("right++; sum += a[left];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("下标用错了");
});

test("rejects moving the right end without adding it to the window sum", () => {
  const result = checker("right++;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("还没进窗口和");
});

test("rejects adding without moving and explains the end point is still outside", () => {
  const result = checker("sum += a[right];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("还没写");
});

test("rejects moving the left pointer and explains it shrinks the window", () => {
  const result = checker("left++; sum += a[left];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("移错指针");
});

test("rejects overwriting the window sum and asks for the accumulating form", () => {
  const result = checker("right++; sum = a[right];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("覆盖");
});

test("rejects stepping the right end backwards and explains it only grows", () => {
  const result = checker("right--; sum += a[right];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("往右");
});

// 断言只用「right++」「right」这类子串时，兜底句里也有这些字，分支写错照样通过。
// 这里追加结构性约束：每种错都要有各自的指正。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    "right＋＋； sum ＋= a［right］；",
    "sum += a[right]; right++;",
    "right++; sum -= a[right];",
    "right++; sum += a[left];",
    "right++;",
    "sum += a[right];",
    "left++; sum += a[left];",
    "right++; sum = a[right];",
    "right--; sum += a[right];",
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
