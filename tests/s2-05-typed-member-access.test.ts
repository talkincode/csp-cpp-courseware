import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s2-05/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s2-05/index.html is missing function ${name}()`);

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
type MemberChecker = (raw: string) => CheckResult;

const checker = (() => {
  const body = [
    extractFunction("normalizeMemberInput"),
    extractFunction("checkMemberAccessFix"),
    "return checkMemberAccessFix;",
  ].join("\n");
  return new Function(body)() as MemberChecker;
})();

test("accepts reading the score of the first student as a[0].score", () => {
  const result = checker("a[0].score");

  expect(result.ok).toBe(true);
});

test("tolerates padding and inner spaces", () => {
  expect(checker("  a[ 0 ].score  ").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("   ");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width punctuation and asks for half-width input", () => {
  for (const raw of ["a[0]．score", "a［0］.score"]) {
    const result = checker(raw);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("半角");
  }
});

test("rejects the arrow operator and explains a[0] is already a card", () => {
  const result = checker("a[0]->score");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("点号");
});

test("rejects reading name instead of score", () => {
  const result = checker("a[0].name");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("score");
});

test("rejects a struct array without an index and asks for a[0]", () => {
  const result = checker("a.score");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("a[0]");
});

test("rejects a[1] and points at the first student", () => {
  const result = checker("a[1].score");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("a[0]");
});

test("rejects a missing dot between the card and the member", () => {
  const result = checker("a[0]score");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("点号");
});

test("rejects a bare member name and a missing bracket", () => {
  const bare = checker("score");
  const noBracket = checker("a0.score");

  expect(bare.ok).toBe(false);
  expect(bare.message).toContain("a[0]");
  expect(noBracket.ok).toBe(false);
  expect(noBracket.message).toContain("方括号");
});
