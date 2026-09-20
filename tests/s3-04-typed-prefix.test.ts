import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s3-04/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s3-04/index.html is missing function ${name}()`);

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
type PrefixChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizePrefixInput"),
    extractFunction("checkPrefixLine"),
    "return checkPrefixLine;",
  ].join("\n");
  return new Function(body)() as PrefixChecker;
})();

test("accepts carrying the previous cell forward and adding this cell", () => {
  const result = checker("sum[i] = sum[i - 1] + a[i]");

  expect(result.ok).toBe(true);
});

test("tolerates padding and a trailing semicolon", () => {
  expect(checker("  sum[i]=sum[i-1]+a[i] ; ").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width brackets, equals and plus and asks for half-width", () => {
  const result = checker("sum［i］ ＝ sum［i - 1］ ＋ a［i］");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects adding this cell twice and explains the previous cell is missing", () => {
  const result = checker("sum[i] = sum[i] + a[i]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("少减了 1");
});

test("rejects dropping this cell and asks for a[i]", () => {
  const result = checker("sum[i] = sum[i - 1]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("少了这一格的数");
});

test("rejects a shifted index on the array and explains which cell belongs here", () => {
  const result = checker("sum[i] = sum[i - 1] + a[i - 1]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("下标错位");
});

test("rejects reaching forward and explains the accumulation goes backwards", () => {
  const result = checker("sum[i] = sum[i + 1] + a[i]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("往前");
});

test("rejects summing only two neighbouring cells without the running total", () => {
  const result = checker("sum[i] = a[i - 1] + a[i]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("只加了相邻两格");
});

test("rejects adding the index instead of the array cell", () => {
  const result = checker("sum[i] = sum[i - 1] + i");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("不是下标");
});

// 之前的断言只用「a[i]」「i - 1」这类子串，兜底句里也含这些字，分支写错也照样通过，
// 所以一条正则漏了转义一直没被发现。这里追加结构性约束：每种错都要有各自的指正。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    "sum［i］ ＝ sum［i - 1］ ＋ a［i］",
    "sum[i] = sum[i] + a[i]",
    "sum[i] = sum[i - 1]",
    "sum[i] = sum[i - 1] + a[i - 1]",
    "sum[i] = sum[i + 1] + a[i]",
    "sum[i] = a[i - 1] + a[i]",
    "sum[i] = sum[i - 1] + i",
    "sum[i - 1] = sum[i] + a[i]",
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
