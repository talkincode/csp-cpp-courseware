import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s4-06/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s4-06/index.html is missing function ${name}()`);

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
type TransitionChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeTransitionInput"),
    extractFunction("checkTransitionLine"),
    "return checkTransitionLine;",
  ].join("\n");
  return new Function(body)() as TransitionChecker;
})();

test("accepts the transition that picks the better of skipping and taking", () => {
  const result = checker("dp[i] = max(dp[i - 1], dp[i - 2] + nums[i]);");

  expect(result.ok).toBe(true);
});

test("tolerates padding, a trailing semicolon and the two arguments swapped", () => {
  expect(checker("  dp[i] = max(dp[i - 1], dp[i - 2] + nums[i]);  ").ok).toBe(true);
  expect(checker("dp[i] = max(dp[i - 2] + nums[i], dp[i - 1]);").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("dp［i］＝max（dp［i－1］，dp［i－2］＋nums［i］）");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects adding both dp values and explains they are alternatives", () => {
  const result = checker("dp[i] = dp[i - 1] + dp[i - 2];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("nums[i]");
});

test("rejects a transition that skips two positions without taking i", () => {
  const result = checker("dp[i] = dp[i - 1] + nums[i];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("i - 2");
});

test("rejects dropping the skip option and explains dp[i - 1] must be there", () => {
  const result = checker("dp[i] = dp[i - 2] + nums[i];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("dp[i - 1]");
});

test("rejects taking from i - 1 and explains it would pick two neighbours", () => {
  const result = checker("dp[i] = max(dp[i - 1], dp[i - 1] + nums[i]);");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("i - 2");
});

test("rejects using dp[i + 1] and explains that cell is not computed yet", () => {
  const result = checker("dp[i] = max(dp[i + 1], dp[i - 2] + nums[i]);");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("还没算");
});

test("rejects reading nums[i + 1] and explains it would reach past the row", () => {
  const result = checker("dp[i] = max(dp[i - 1], dp[i - 2] + nums[i + 1]);");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("越界");
});

test("rejects a max without the amounts and asks for nums[i]", () => {
  const result = checker("dp[i] = max(dp[i - 1], dp[i - 2]);");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("nums[i]");
});

test("rejects adding three terms in a row and asks for max", () => {
  const result = checker("dp[i] = dp[i - 1] + dp[i - 2] + nums[i];");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("max");
});

test("rejects a right-hand side without dp[i] on the left", () => {
  const result = checker("max(dp[i - 1], dp[i - 2] + nums[i]);");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("等号左边");
});

// 同一批课里出过「一条正则漏转义导致指正分支永远不可达」的 bug，所以追加结构性约束：
// 每种错都要有自己的指正，而不是全部退化成最后那句兜底。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    "dp［i］＝max（dp［i－1］，dp［i－2］＋nums［i］）",
    "dp[i] = dp[i - 1] + dp[i - 2];",
    "dp[i] = dp[i - 1] + nums[i];",
    "dp[i] = dp[i - 2] + nums[i];",
    "dp[i] = max(dp[i - 1], dp[i - 1] + nums[i]);",
    "dp[i] = max(dp[i + 1], dp[i - 2] + nums[i]);",
    "dp[i] = max(dp[i - 1], dp[i - 2] + nums[i + 1]);",
    "dp[i] = max(dp[i - 1], dp[i - 2]);",
    "dp[i] = dp[i - 1] + dp[i - 2] + nums[i];",
    "max(dp[i - 1], dp[i - 2] + nums[i]);",
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
