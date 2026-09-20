import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s5-01/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s5-01/index.html is missing function ${name}()`);

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
type ArraySizeChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeArraySizeInput"),
    extractFunction("checkArraySizeLine"),
    "return checkArraySizeLine;",
  ].join("\n");
  return new Function(body)() as ArraySizeChecker;
})();

const canonical = "int a[100005];";

test("accepts the array line sized from the circled data range", () => {
  expect(checker(canonical).ok).toBe(true);
  expect(checker("int a[100001];").ok).toBe(true);
  expect(checker("int a[100005];   ").ok).toBe(true);
  expect(checker("int  a [ 100005 ] ;").ok).toBe(true);
});

test("stays quiet about the canonical line", () => {
  const result = checker(canonical);

  expect(result.ok).toBe(true);
  expect(result.message).toBe("");
});

test("accepts a roomier array but still says the range is 100000", () => {
  const result = checker("int a[1000100];");

  expect(result.ok).toBe(true);
  expect(result.message).toContain("100000");
});

test("rejects an empty box with a nudge back to the circled range", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("审题");
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("int a［100005］；");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects an array that is exactly 100000 cells and explains the last index", () => {
  const result = checker("int a[100000];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("越界");
});

test("rejects a plainly too small array and names the range that breaks it", () => {
  const result = checker("int a[105];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("太小");
  expect(result.message).toContain("100000");
});

test("rejects an array size taken from the input variable", () => {
  const result = checker("int a[n];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("常数");
});

test("rejects a missing element type and explains the declaration shape", () => {
  const result = checker("a[100005];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("类型");
});

test("rejects a missing trailing semicolon and points at the end of the line", () => {
  const result = checker("int a[100005]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("分号");
});

// 同一批课里出过「一条正则漏转义导致指正分支永远不可达」的 bug，所以追加结构性约束：
// 每种错都要有自己的指正，而不是全部退化成最后那句兜底。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    "int a［100005］；",
    "int a[100000];",
    "int a[105];",
    "int a[n];",
    "a[100005];",
    "int a[100005]",
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
