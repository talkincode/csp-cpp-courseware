import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s4-02/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s4-02/index.html is missing function ${name}()`);

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
type SumChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeSumInput"),
    extractFunction("checkSumLine"),
    "return checkSumLine;",
  ].join("\n");
  return new Function(body)() as SumChecker;
})();

test("accepts accumulating the current cell into the sum", () => {
  const result = checker("sum += a[i];");

  expect(result.ok).toBe(true);
});

test("tolerates padding and the long form of the same addition", () => {
  expect(checker("  sum  +=  a[i] ;  ").ok).toBe(true);
  expect(checker("sum = sum + a[i];").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("sum ＋= a［i］；");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects a missing trailing semicolon and asks about it", () => {
  const result = checker("sum += a[i]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("分号");
});

test("rejects overwriting the running total and explains why the sum is lost", () => {
  const result = checker("sum = a[i];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("覆盖");
});

test("rejects adding the index instead of the cell", () => {
  const result = checker("sum += i;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("下标");
});

test("rejects a[0] and reminds the learner where this lesson starts storing", () => {
  const result = checker("sum += a[0];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("a[1]");
});

test("rejects a[n] and points at the loop variable", () => {
  const result = checker("sum += a[n];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("i");
});

test("rejects reading again instead of adding what was already read", () => {
  const result = checker("cin >> a[i];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("读");
});

// 同一批课里出过「一条正则漏转义导致指正分支永远不可达」的 bug，所以追加结构性约束：
// 每种错都要有自己的指正，而不是全部退化成最后那句兜底。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    "sum ＋= a［i］；",
    "sum += a[i]",
    "sum = a[i];",
    "sum += i;",
    "sum += a[0];",
    "sum += a[n];",
    "cin >> a[i];",
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
