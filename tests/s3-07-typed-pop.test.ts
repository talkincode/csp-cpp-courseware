import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s3-07/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s3-07/index.html is missing function ${name}()`);

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
type StackChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeStackInput"),
    extractFunction("checkStackPop"),
    "return checkStackPop;",
  ].join("\n");
  return new Function(body)() as StackChecker;
})();

test("accepts popping the left bracket that just matched", () => {
  const result = checker("st.pop()");

  expect(result.ok).toBe(true);
});

test("tolerates padding and a trailing semicolon", () => {
  expect(checker("  st . pop ( ) ;  ").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width parentheses and dot and asks for half-width", () => {
  const result = checker("st．pop（）");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects top() and explains that looking is not removing", () => {
  const result = checker("st.top()");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("top");
});

test("rejects empty() and explains that it only tests the stack", () => {
  const result = checker("st.empty()");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("empty");
});

test("rejects push() and explains this step removes instead of adding", () => {
  const result = checker("st.push('[')");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("push");
});

test("rejects a bare pop() and asks which stack it belongs to", () => {
  const result = checker("pop()");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("st.");
});
