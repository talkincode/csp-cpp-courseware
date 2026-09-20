import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s2-06/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s2-06/index.html is missing function ${name}()`);

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
type SwapChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [extractFunction("normalizeSwapInput"), extractFunction("checkSwapFix"), "return checkSwapFix;"].join(
    "\n",
  );
  return new Function(body)() as SwapChecker;
})();

test("accepts swapping the adjacent pair as swap(a[0], a[1])", () => {
  const result = checker("swap(a[0], a[1])");

  expect(result.ok).toBe(true);
});

test("also accepts the same adjacent pair written in the other order", () => {
  expect(checker("swap(a[1], a[0])").ok).toBe(true);
});

test("tolerates padding and inner spaces", () => {
  expect(checker("  swap( a[0] , a[1] )  ").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("   ");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("swap（a[0], a[1]）");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects swapping one box with itself", () => {
  const result = checker("swap(a[0], a[0])");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("没换");
});

test("rejects a non-adjacent pair and explains it skips the middle element", () => {
  const result = checker("swap(a[0], a[2])");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("相邻");
});

test("rejects plain assignment and explains it would overwrite a box", () => {
  const result = checker("a[0] = a[1]");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("swap");
});

test("rejects indices without brackets and asks for square brackets", () => {
  const result = checker("swap(a0, a1)");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("方括号");
});

test("rejects a bare swap name without a call", () => {
  const result = checker("swap");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("swap(");
});
