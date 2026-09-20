import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s5-08/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s5-08/index.html is missing function ${name}()`);

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
type ArrayInitChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeArrayInitInput"),
    extractFunction("checkArrayInitLine"),
    "return checkArrayInitLine;",
  ].join("\n");
  return new Function(body)() as ArrayInitChecker;
})();

const canonical = "int cnt[105] = {0};";

test("accepts the counting array that starts from a clean zero", () => {
  expect(checker(canonical).ok).toBe(true);
  expect(checker("int cnt[101] = {0};").ok).toBe(true);
  expect(checker("int cnt[105] = {};").ok).toBe(true);
  expect(checker(`   ${canonical}   `).ok).toBe(true);
});

test("stays quiet about the canonical line", () => {
  const result = checker(canonical);

  expect(result.ok).toBe(true);
  expect(result.message).toBe("");
});

test("rejects an empty box with a nudge about clearing the array", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("清零");
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("int cnt［105］ ＝ ｛0｝；");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects an array that was never cleared and explains the leftover numbers", () => {
  const result = checker("int cnt[105];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("清零");
});

test("rejects a scalar zero and explains it only clears the first cell", () => {
  const result = checker("int cnt[105] = 0;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("第一个格子");
});

test("rejects a too small array and names the top score that would break it", () => {
  const result = checker("int cnt[100] = {0};");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("越界");
});

test("rejects a missing type and explains it is an assignment to one cell", () => {
  const result = checker("cnt[105] = {0};");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("类型");
});

test("rejects a missing trailing semicolon and points at the end of the line", () => {
  const result = checker("int cnt[105] = {0}");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("分号");
});

// 同一批课里出过「一条正则漏转义导致指正分支永远不可达」的 bug，所以追加结构性约束：
// 每种错都要有自己的指正，而不是全部退化成最后那句兜底。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    "int cnt［105］ ＝ ｛0｝；",
    "int cnt[105];",
    "int cnt[105] = 0;",
    "int cnt[100] = {0};",
    "cnt[105] = {0};",
    "int cnt[105] = {0}",
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
