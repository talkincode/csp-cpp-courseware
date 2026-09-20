import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s5-04/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s5-04/index.html is missing function ${name}()`);

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
type RangeQueryChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeRangeQueryInput"),
    extractFunction("checkRangeQueryLine"),
    "return checkRangeQueryLine;",
  ].join("\n");
  return new Function(body)() as RangeQueryChecker;
})();

const canonical = "sum[r] - sum[l - 1]";

test("accepts the prefix-sum query with the left offset subtracted", () => {
  expect(checker(canonical).ok).toBe(true);
  expect(checker("sum[r]-sum[l-1]").ok).toBe(true);
});

test("tolerates padding around the typed expression", () => {
  expect(checker(`   ${canonical}   `).ok).toBe(true);
  expect(checker("  sum[r]-sum[l - 1]").ok).toBe(true);
});

test("stays quiet about a complete expression", () => {
  const result = checker(canonical);

  expect(result.ok).toBe(true);
  expect(result.message).toBe("");
});

test("rejects an empty box with a nudge to write the query", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("区间和");
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("sum［r］－sum［l－1］");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects subtracting sum[l] and names it as the pseudo-optimization the lesson warns about", () => {
  const result = checker("sum[r] - sum[l]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("伪优化");
  expect(result.message).toContain("l - 1");
});

test("rejects a reversed subtraction and explains the sign", () => {
  const swapped = checker("sum[l - 1] - sum[r]");

  expect(swapped.ok).toBe(false);
  expect(swapped.message).toContain("负数");
});

test("rejects adding the two prefixes instead of subtracting", () => {
  const result = checker("sum[r] + sum[l - 1]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("减法");
});

test("rejects writing only the right prefix and explains the missing subtraction", () => {
  const result = checker("sum[r]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("减去");
});

test("rejects writing only the left prefix and explains the missing right endpoint", () => {
  const result = checker("sum[l - 1]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("右端点");
});

test("rejects taking values straight from the array instead of the prefix table", () => {
  const result = checker("a[r] - a[l - 1]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("前缀和表");
});

test("rejects subtracting a raw array element from a prefix sum", () => {
  const result = checker("sum[r] - a[l - 1]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("sum[l - 1]");
});

test("rejects using the array length as the right endpoint", () => {
  const result = checker("sum[n] - sum[l - 1]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("查询");
});

test("rejects an off-by-one left offset that over-subtracts", () => {
  const result = checker("sum[r] - sum[l - 2]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("多减");
});

test("rejects adding one to the range sum", () => {
  const result = checker("sum[r] - sum[l - 1] + 1");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("多加了 1");
});

test("rejects typing the whole cout line inside the box", () => {
  const result = checker("cout << sum[r] - sum[l - 1];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("算式");
});

test("falls back to the canonical form when the expression is something else", () => {
  const result = checker("sum[r * 2] - sum[l]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("sum[r] - sum[l - 1]");
});

// 同一批课里出过「一条正则漏转义导致指正分支永远不可达」的 bug，所以追加结构性约束：
// 每种错都要有自己的指正，而不是全部退化成最后那句兜底。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    "sum［r］－sum［l－1］",
    "sum[r] - sum[l]",
    "sum[l - 1] - sum[r]",
    "sum[r] + sum[l - 1]",
    "sum[r]",
    "sum[l - 1]",
    "a[r] - a[l - 1]",
    "sum[r] - a[l - 1]",
    "sum[n] - sum[l - 1]",
    "sum[r] - sum[l - 2]",
    "sum[r] - sum[l - 1] + 1",
    "cout << sum[r] - sum[l - 1];",
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
