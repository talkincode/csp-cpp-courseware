import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s4-07/index.html`;
const source = await Bun.file(lessonPath).text();

function extractFunction(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`lessons/s4-07/index.html is missing function ${name}()`);

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
    extractFunction("checkVisitedGuard"),
    "return checkVisitedGuard;",
  ].join("\n");
  return new Function(body)() as GuardChecker;
})();

test("accepts the stop condition that returns when the point was already visited", () => {
  const result = checker("if (visited[u]) return;");

  expect(result.ok).toBe(true);
});

test("tolerates padding and the explicit comparison with true", () => {
  expect(checker("  if ( visited[ u ] ) return ;  ").ok).toBe(true);
  expect(checker("if (visited[u] == true) return;").ok).toBe(true);
});

test("rejects an empty box with a nudge to type", () => {
  const result = checker("");

  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
});

test("rejects full-width punctuation and asks for half-width input", () => {
  const result = checker("if（visited［u］）return；");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("半角");
});

test("rejects a missing semicolon and points at the end of the statement", () => {
  const result = checker("if (visited[u]) return");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("分号");
});

test("rejects an inverted condition and explains dfs would stop before it starts", () => {
  const result = checker("if (!visited[u]) return;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("写反");
});

test("rejects comparing with false and explains true means visited", () => {
  const result = checker("if (visited[u] == false) return;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("true");
});

test("rejects a single equals sign and explains it assigns instead of comparing", () => {
  const result = checker("if (visited[u] = true) return;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("等号");
});

test("rejects returning a value from the void dfs", () => {
  const result = checker("if (visited[u]) return 0;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("void");
});

test("rejects break and explains it only leaves a loop", () => {
  const result = checker("if (visited[u]) break;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("break");
});

test("rejects checking the neighbour list instead of the visited marker", () => {
  const result = checker("if (adj[u]) return;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("邻接表");
});

test("rejects the loop index and explains the parameter is u", () => {
  const result = checker("if (visited[i]) return;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("参数");
});

test("rejects the marking line that is already in the scaffold", () => {
  const result = checker("visited[u] = true;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("登记");
});

test("rejects a bare return and explains the condition is missing", () => {
  const result = checker("return;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("条件");
});

test("rejects a condition that never mentions the visited marker", () => {
  const result = checker("if (u == 0) return;");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("visited[u]");
});

// 同一批课里出过「一条正则漏转义导致指正分支永远不可达」的 bug，所以追加结构性约束：
// 每种错都要有自己的指正，而不是全部退化成最后那句兜底。
test("每种错都有自己的指正，不会全退化成同一句兜底", () => {
  const wrongInputs = [
    "",
    "if（visited［u］）return；",
    "if (visited[u]) return",
    "if (!visited[u]) return;",
    "if (visited[u] == false) return;",
    "if (visited[u] = true) return;",
    "if (visited[u]) return 0;",
    "if (visited[u]) break;",
    "if (adj[u]) return;",
    "if (visited[i]) return;",
    "visited[u] = true;",
    "return;",
    "if (u == 0) return;",
  ];
  const messages = wrongInputs.map((input) => checker(input).message);

  for (const message of messages) expect(message.length).toBeGreaterThan(0);
  expect(new Set(messages).size).toBe(messages.length);
});
