import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s5-05/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s5-05/index.html is missing function ${name}()`);

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
type EmptyGuardChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeEmptyGuardInput"),
    extractFunction("checkEmptyGuardLine"),
    "return checkEmptyGuardLine;",
  ].join("\n");
  return new Function(body)() as EmptyGuardChecker;
})();

const canonical = 'if (n == 0) { cout << 0 << "\\n"; return 0; }';

test("accepts the empty-data guard that prints zero and stops", () => {
  expect(checker(canonical).ok).toBe(true);
  expect(checker('if(n==0){cout<<0<<"\\n";return0;}').ok).toBe(true);
});

test("tolerates padding around the typed guard", () => {
  expect(checker(`   ${canonical}   `).ok).toBe(true);
  expect(checker('  if (n == 0) { cout << 0 << endl; return 0; }  ').ok).toBe(true);
});

test("stays quiet about a complete guard", () => {
  const result = checker(canonical);

  expect(result.ok).toBe(true);
  expect(result.message).toBe("");
});

test("rejects an empty box with a nudge about the n=0 boundary group", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("空数据");
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker('if （n ＝＝ 0） ｛ cout ＜＜ 0 ＜＜ "\\n"； return 0； ｝');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects a single equals sign and explains assignment versus comparison", () => {
  const result = checker('if (n = 0) { cout << 0 << "\\n"; return 0; }');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("赋值");
});

test("rejects guarding n == 1 and points at the group that actually breaks", () => {
  const result = checker('if (n == 1) { cout << 0 << "\\n"; return 0; }');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("n=0");
});

test("rejects comparing the first array element instead of the count", () => {
  const result = checker('if (a[1] == 0) { cout << 0 << "\\n"; return 0; }');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("第一个数");
});

test("rejects a too-wide condition and explains it swallows normal inputs", () => {
  const result = checker('if (n >= 0) { cout << 0 << "\\n"; return 0; }');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("太宽");
});

test("rejects a loop where the empty case only needs one check", () => {
  const result = checker('while (n == 0) { cout << 0 << "\\n"; return 0; }');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("if");
});

test("rejects a brace-less guard and explains the two statements", () => {
  const result = checker('if (n == 0) cout << 0 << "\\n";');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("花括号");
});

test("rejects a guard without return and explains the program would read a[1] anyway", () => {
  const result = checker('if (n == 0) { cout << 0 << "\\n"; }');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("return");
});

test("rejects a guard that only returns without printing", () => {
  const result = checker("if (n == 0) { return 0; }");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("输出");
});

test("rejects a missing inner semicolon and points at the end of the line", () => {
  const result = checker('if (n == 0) { cout << 0 << "\\n" return 0; }');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("分号");
});

// 同一批课里出过「一条正则漏转义导致指正分支永远不可达」的 bug，所以追加结构性约束：
// 每种错都要有自己的指正，而不是全部退化成最后那句兜底。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    'if （n ＝＝ 0） ｛ cout ＜＜ 0 ＜＜ "\\n"； return 0； ｝',
    'if (n = 0) { cout << 0 << "\\n"; return 0; }',
    'if (n == 1) { cout << 0 << "\\n"; return 0; }',
    'if (a[1] == 0) { cout << 0 << "\\n"; return 0; }',
    'if (n >= 0) { cout << 0 << "\\n"; return 0; }',
    'while (n == 0) { cout << 0 << "\\n"; return 0; }',
    'if (n == 0) cout << 0 << "\\n";',
    'if (n == 0) { cout << 0 << "\\n"; }',
    "if (n == 0) { return 0; }",
    'if (n == 0) { cout << 0 << "\\n" return 0; }',
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
