import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s5-02/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s5-02/index.html is missing function ${name}()`);

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
type DebugPrintChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeDebugPrintInput"),
    extractFunction("checkDebugPrint"),
    "return checkDebugPrint;",
  ].join("\n");
  return new Function(body)() as DebugPrintChecker;
})();

const canonical = 'cout << i << " " << prefix << "\\n";';

test("accepts printing both the round counter and the running sum", () => {
  expect(checker(canonical).ok).toBe(true);
  expect(checker('cout<<i<<" "<<prefix<<"\\n";').ok).toBe(true);
});

test("tolerates padding around the typed line", () => {
  expect(checker(`   ${canonical}   `).ok).toBe(true);
  expect(checker('  cout << i << " " << prefix << endl;  ').ok).toBe(true);
});

test("accepts endl and stays quiet about a complete line", () => {
  const result = checker('cout << i << " " << prefix << endl;');

  expect(result.ok).toBe(true);
  expect(result.message).toBe("");
});

test("accepts the line without a newline and reminds the learner to add one", () => {
  const result = checker('cout << i << " " << prefix;');

  expect(result.ok).toBe(true);
  expect(result.message).toContain("换行");
});

test("accepts printing the sum first as long as both values show up", () => {
  expect(checker('cout << prefix << " " << i << "\\n";').ok).toBe(true);
});

test("accepts labelled output that prints both values as variables", () => {
  expect(checker('cout << "i=" << i << " prefix=" << prefix << "\\n";').ok).toBe(true);
});

test("rejects an empty box with a nudge to type the segmented print", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("分段输出");
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker('cout ＜＜ i ＜＜ " " ＜＜ prefix ＜＜ "\\n"；');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects a missing semicolon and points at the end of the line", () => {
  const result = checker('cout << i << " " << prefix << "\\n"');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("分号");
});

test("rejects cin and explains the direction of reading versus printing", () => {
  const result = checker("cin >> i >> prefix;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("读入");
});

test("rejects cout with the reading arrows", () => {
  const result = checker('cout >> i >> " " >> prefix;');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("<<");
});

test("rejects printing only the running sum and explains the round counter is missing", () => {
  const result = checker('cout << prefix << "\\n";');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("第几轮");
});

test("rejects printing only the round counter and explains the running sum is missing", () => {
  const result = checker('cout << i << "\\n";');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("prefix");
});

test("rejects quoting the variable names and explains they become fixed text", () => {
  const result = checker('cout << "i" << " " << "prefix" << "\\n";');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("引号");
});

test("rejects printing the array value instead of the running sum", () => {
  const result = checker('cout << a[i] << "\\n";');

  expect(result.ok).toBe(false);
  expect(result.message).toContain("prefix");
});

test("rejects a comma between the two values and explains the output arrows", () => {
  const result = checker("cout << i, prefix;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("逗号");
});

test("rejects adding the two values together and explains they must be readable separately", () => {
  const result = checker("cout << i + prefix;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("相加");
});

// 同一批课里出过「一条正则漏转义导致指正分支永远不可达」的 bug，所以追加结构性约束：
// 每种错都要有自己的指正，而不是全部退化成最后那句兜底。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    'cout ＜＜ i ＜＜ " " ＜＜ prefix ＜＜ "\\n"；',
    'cout << i << " " << prefix << "\\n"',
    "cin >> i >> prefix;",
    'cout >> i >> " " >> prefix;',
    'cout << prefix << "\\n";',
    'cout << i << "\\n";',
    'cout << "i" << " " << "prefix" << "\\n";',
    'cout << a[i] << "\\n";',
    "cout << i, prefix;",
    "cout << i + prefix;",
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
