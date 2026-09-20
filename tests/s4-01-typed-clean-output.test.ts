import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s4-01/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s4-01/index.html is missing function ${name}()`);

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
type OutputChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeOutputInput"),
    extractFunction("checkCleanOutput"),
    "return checkCleanOutput;",
  ].join("\n");
  return new Function(body)() as OutputChecker;
})();

test("accepts the clean output line the lesson asks for", () => {
  const result = checker("cout << n + 1;");

  expect(result.ok).toBe(true);
});

test("tolerates padding and the reversed operand order", () => {
  expect(checker("  cout<<n+1;  ").ok).toBe(true);
  expect(checker("cout << 1 + n;").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("cout ＜＜ n ＋ 1；");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects a missing trailing semicolon and asks about it", () => {
  const result = checker("cout << n + 1");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("分号");
});

test("rejects a leftover prompt and explains clean output", () => {
  const result = checker('cout << "请输入" << n + 1;');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("提示语");
});

test("rejects cin for reading and points back at standard output", () => {
  const result = checker("cin >> n + 1;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("cin");
});

test("rejects cout with >> and explains which way data flows", () => {
  const result = checker("cout >> n + 1;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("<<");
});

test("rejects a quoted expression and explains it would print text", () => {
  const result = checker('cout << "n+1";');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("引号");
});

test("rejects printing n alone and points at the + 1 the statement asks for", () => {
  const result = checker("cout << n;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("n + 1");
});

test("rejects a bare expression without cout", () => {
  const result = checker("n + 1;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("cout");
});

test("rejects printf and keeps cout as the line this lesson is practising", () => {
  const result = checker('printf("%d", n + 1);');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("cout");
});

// 之前的课出现过「一条正则漏转义导致分支永远不可达」的 bug，所以这里追加结构性约束：
// 每种错都要有各自的指正，而不是全部退化成最后那句兜底。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    "cout ＜＜ n ＋ 1；",
    "cout << n + 1",
    'cout << "请输入" << n + 1;',
    "cin >> n + 1;",
    "cout >> n + 1;",
    'cout << "n+1";',
    "cout << n;",
    "n + 1;",
    'printf("%d", n + 1);',
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
