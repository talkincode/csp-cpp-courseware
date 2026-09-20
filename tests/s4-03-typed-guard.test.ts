import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s4-03/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s4-03/index.html is missing function ${name}()`);

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
type GuardChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeGuardInput"),
    extractFunction("checkGuardLine"),
    "return checkGuardLine;",
  ].join("\n");
  return new Function(body)() as GuardChecker;
})();

test("accepts the guard that keeps the balance from going negative", () => {
  const result = checker("if (balance + x >= 0)");

  expect(result.ok).toBe(true);
});

test("tolerates padding and the equivalent form of the same guard", () => {
  expect(checker("  if ( balance + x >= 0 )  ").ok).toBe(true);
  expect(checker("if(balance >= -x)").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("if （balance ＋ x ＞= 0）");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects a strict comparison and explains that exactly zero is allowed", () => {
  const result = checker("if (balance + x > 0)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("刚好");
});

test("rejects the reversed comparison and explains it would skip affordable events", () => {
  const result = checker("if (balance + x <= 0)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("余额够");
});

test("rejects comparing the balance with x and points at the balance after the event", () => {
  const result = checker("if (balance >= x)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("balance + x");
});

test("rejects subtracting x and explains the sign of the event", () => {
  const result = checker("if (balance - x >= 0)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("符号");
});

test("rejects a loop and explains each event is handled once", () => {
  const result = checker("while (balance + x >= 0)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("if");
});

test("rejects a condition without if and parentheses", () => {
  const result = checker("balance + x >= 0");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("小括号");
});

// 同一批课里出过「一条正则漏转义导致指正分支永远不可达」的 bug，所以追加结构性约束：
// 每种错都要有自己的指正，而不是全部退化成最后那句兜底。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    "if （balance ＋ x ＞= 0）",
    "if (balance + x > 0)",
    "if (balance + x <= 0)",
    "if (balance >= x)",
    "if (balance - x >= 0)",
    "while (balance + x >= 0)",
    "balance + x >= 0",
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
