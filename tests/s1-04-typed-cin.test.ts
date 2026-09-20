import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s1-04/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s1-04/index.html is missing function ${name}()`);

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
type CinChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeCinLine"),
    extractFunction("checkCinLine"),
    "return checkCinLine;",
  ].join("\n");
  return new Function(body)() as CinChecker;
})();

test("accepts the chained input statement the lesson asks for", () => {
  expect(checker("cin >> a >> b;").ok).toBe(true);
  expect(checker("  cin>>a>>b;  ").ok).toBe(true);
});

test("rejects cout and points back to cin", () => {
  const result = checker("cout << a << b;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("cin");
});

test("rejects a comma between variables", () => {
  const result = checker("cin >> a, b;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain(">>");
});

test("rejects the wrong stream direction", () => {
  const result = checker("cin << a << b;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain(">>");
});

test("rejects a missing semicolon", () => {
  const result = checker("cin >> a >> b");

  expect(result.ok).toBe(false);
  expect(result.message).toContain(";");
});
