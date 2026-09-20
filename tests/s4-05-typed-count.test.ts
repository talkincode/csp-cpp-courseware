import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s4-05/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s4-05/index.html is missing function ${name}()`);

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
type CountChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeCountInput"),
    extractFunction("checkCountLine"),
    "return checkCountLine;",
  ].join("\n");
  return new Function(body)() as CountChecker;
})();

test("accepts counting the score as the loop reads it", () => {
  const result = checker("cnt[score]++;");

  expect(result.ok).toBe(true);
});

test("tolerates padding and the two equivalent ways of adding one", () => {
  expect(checker("  cnt[ score ] ++ ;  ").ok).toBe(true);
  expect(checker("cnt[score] += 1;").ok).toBe(true);
  expect(checker("cnt[score] = cnt[score] + 1;").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("cnt［score］＋＋；");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects a missing semicolon and points at the end of the statement", () => {
  const result = checker("cnt[score]++");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("分号");
});

test("rejects assigning one and explains it would overwrite the earlier count", () => {
  const result = checker("cnt[score] = 1;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("覆盖");
});

test("rejects adding one to the score and points at the counter", () => {
  const result = checker("score++;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("分数自己");
});

test("rejects using the student index and explains i is not the score", () => {
  const result = checker("cnt[i]++;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("第几个");
});

test("rejects a counter without the index and asks for the brackets", () => {
  const result = checker("cnt++;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("方括号");
});

test("rejects reading the score twice and explains it is already read", () => {
  const result = checker("cin >> score;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("读");
});

test("rejects subtracting and explains a count only grows", () => {
  const result = checker("cnt[score]--;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("加");
});

test("rejects computing one without storing it back", () => {
  const result = checker("cnt[score] + 1;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("存回去");
});

// 同一批课里出过「一条正则漏转义导致指正分支永远不可达」的 bug，所以追加结构性约束：
// 每种错都要有自己的指正，而不是全部退化成最后那句兜底。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    "cnt［score］＋＋；",
    "cnt[score]++",
    "cnt[score] = 1;",
    "score++;",
    "cnt[i]++;",
    "cnt++;",
    "cin >> score;",
    "cnt[score]--;",
    "cnt[score] + 1;",
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
