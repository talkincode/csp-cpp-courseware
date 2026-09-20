import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s3-06/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s3-06/index.html is missing function ${name}()`);

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
type GreedyChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeGreedyInput"),
    extractFunction("checkGreedySort"),
    "return checkGreedySort;",
  ].join("\n");
  return new Function(body)() as GreedyChecker;
})();

test("accepts sorting the activities by ending time", () => {
  const result = checker("sort(a + 1, a + 4, by_end)");

  expect(result.ok).toBe(true);
});

test("tolerates padding and a trailing semicolon", () => {
  expect(checker("  sort( a + 1 , a + 4 , by_end ) ; ").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width parentheses, plus and comma and asks for half-width", () => {
  const result = checker("sort（a ＋ 1, a ＋ 4, by_end）；");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects sorting by starting time and explains the counterexample", () => {
  const result = checker("sort(a + 1, a + 4, by_start)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("开始时间");
});

test("rejects sorting by duration and explains it picks the longest first", () => {
  const result = checker("sort(a + 1, a + 4, by_length)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("时长");
});

test("rejects a missing comparator and asks for by_end", () => {
  const result = checker("sort(a + 1, a + 4)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("少了第三个参数");
});

test("rejects a made-up comparator name and points back to the scaffolding one", () => {
  const result = checker("sort(a + 1, a + 4, by_e)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("要对上脚手架");
});

test("rejects starting from a[0] and explains the data begins at a[1]", () => {
  const result = checker("sort(a, a + 4, by_end)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("会把 a[0] 也排进去");
});

test("rejects stopping one short and explains the whole range must be sorted", () => {
  const result = checker("sort(a + 1, a + 3, by_end)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("只排到前 2 个");
});

// 断言只用「by_end」「a + 1」这类子串时，兜底句里也有这些字，分支写错照样通过。
// 这里追加结构性约束：每种错都要有各自的指正。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    "sort（a ＋ 1， a ＋ 4， by_end）",
    "sort(a + 1, a + 4, by_start)",
    "sort(a + 1, a + 4, by_length)",
    "sort(a + 1, a + 4, by_e)",
    "sort(a + 1, a + 4)",
    "sort(a + 1, a + 4, by_end, greater)",
    "sort(a, a + 4, by_end)",
    "sort(a + 1, a + 3, by_end)",
    "sort(a + 4, a + 1, by_end)",
    "双层 for 手工找最早结束",
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
