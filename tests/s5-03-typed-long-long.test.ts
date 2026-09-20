import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s5-03/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s5-03/index.html is missing function ${name}()`);

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
type SumTypeChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeSumTypeInput"),
    extractFunction("checkSumType"),
    "return checkSumType;",
  ].join("\n");
  return new Function(body)() as SumTypeChecker;
})();

test("accepts declaring the accumulator as long long and initialising it to 0", () => {
  expect(checker("long long sum = 0;").ok).toBe(true);
  expect(checker("longlongsum=0;").ok).toBe(true);
});

test("tolerates padding and the LL suffix on the literal", () => {
  expect(checker("   long long sum = 0;   ").ok).toBe(true);
  expect(checker("long long sum = 0LL;").ok).toBe(true);
});

test("accepts the line without a comment about the type", () => {
  const result = checker("long long sum = 0;");

  expect(result.ok).toBe(true);
  expect(result.message).toBe("");
});

test("rejects an empty box with a nudge to type the declaration", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("声明");
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("long long sum ＝ 0；");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects a missing semicolon and points at the end of the line", () => {
  const result = checker("long long sum = 0");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("分号");
});

test("rejects keeping int and explains it still cannot hold the sum", () => {
  const result = checker("int sum = 0;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("装不下");
});

test("rejects a plain long and explains its width differs between platforms", () => {
  const result = checker("long sum = 0;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("long long");
});

test("rejects a declaration without a type and explains the type is missing", () => {
  const result = checker("sum = 0;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("类型");
});

test("rejects a declaration without a starting value and explains the initial value", () => {
  const result = checker("long long sum;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("初始");
});

test("rejects starting the accumulator at one and explains it shifts the total", () => {
  const result = checker("long long sum = 1;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("0");
});

test("rejects a differently cased variable name and points at the scaffold name", () => {
  const result = checker("long long Sum = 0;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("大小写");
});

test("rejects unsigned int and explains the range is still too small", () => {
  const result = checker("unsigned int sum = 0;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("unsigned int");
});

test("rejects double and explains integer sums keep integer types", () => {
  const result = checker("double sum = 0;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("double");
});

// 同一批课里出过「一条正则漏转义导致指正分支永远不可达」的 bug，所以追加结构性约束：
// 每种错都要有自己的指正，而不是全部退化成最后那句兜底。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    "long long sum ＝ 0；",
    "long long sum = 0",
    "int sum = 0;",
    "long sum = 0;",
    "sum = 0;",
    "long long sum;",
    "long long sum = 1;",
    "long long Sum = 0;",
    "unsigned int sum = 0;",
    "double sum = 0;",
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
