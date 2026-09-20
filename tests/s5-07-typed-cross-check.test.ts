import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s5-07/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s5-07/index.html is missing function ${name}()`);

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
type CrossCheckChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeCrossCheckInput"),
    extractFunction("checkCrossCheckLine"),
    "return checkCrossCheckLine;",
  ].join("\n");
  return new Function(body)() as CrossCheckChecker;
})();

const canonical = "long long formula = 1LL * n * (n + 1) / 2;";

test("accepts the independent formula used for the cross check", () => {
  expect(checker(canonical).ok).toBe(true);
  expect(checker("long long formula=1LL*n*(n+1)/2;").ok).toBe(true);
  expect(checker(`   ${canonical}   `).ok).toBe(true);
});

test("stays quiet about the canonical line", () => {
  const result = checker(canonical);

  expect(result.ok).toBe(true);
  expect(result.message).toBe("");
});

test("accepts the swapped product order and explains why it is equivalent", () => {
  const result = checker("long long formula = 1LL * (n + 1) * n / 2;");

  expect(result.ok).toBe(true);
  expect(result.message).toContain("1LL");
});

test("rejects an empty box with a nudge about the cross check", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("交叉检查");
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("long long formula ＝ 1LL ＊ n ＊ （n ＋ 1） ／ 2；");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects the formula without 1LL and explains the int overflow", () => {
  const result = checker("long long formula = n * (n + 1) / 2;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("溢出");
});

test("rejects dividing before multiplying and explains the lost half", () => {
  const result = checker("long long formula = (n + 1) / 2 * n;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("小数");
});

test("rejects the square formula and says which factor is missing", () => {
  const result = checker("long long formula = n * n / 2;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("(n + 1)");
});

test("rejects a bare expression and asks for the declaration", () => {
  const result = checker("1LL * n * (n + 1) / 2;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("声明");
});

test("rejects a missing trailing semicolon and points at the end of the line", () => {
  const result = checker("long long formula = 1LL * n * (n + 1) / 2");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("分号");
});

// 同一批课里出过「一条正则漏转义导致指正分支永远不可达」的 bug，所以追加结构性约束：
// 每种错都要有自己的指正，而不是全部退化成最后那句兜底。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    "long long formula ＝ 1LL ＊ n ＊ （n ＋ 1） ／ 2；",
    "long long formula = n * (n + 1) / 2;",
    "long long formula = (n + 1) / 2 * n;",
    "long long formula = n * n / 2;",
    "1LL * n * (n + 1) / 2;",
    "long long formula = 1LL * n * (n + 1) / 2",
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
