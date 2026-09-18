import { expect, test } from "bun:test";

type FaqLink = { title: string; url: string };
type FaqTerm = {
  id: string;
  term: string;
  aliases: string[];
  summary: string;
  answer: string;
  remember: string;
  links: FaqLink[];
};

const catalogFile = Bun.file(`${import.meta.dir}/../glossary/faq.json`);
const panelFile = Bun.file(`${import.meta.dir}/../glossary/faq-panel.js`);

async function expectLessonFaqWiring(directory: string, extraIds: string[] = []) {
  const catalog = (await catalogFile.json()) as { terms: FaqTerm[] };
  const catalogIds = new Set(catalog.terms.map((term) => term.id));
  const manifest = (await Bun.file(`${import.meta.dir}/../lessons/${directory}/lesson.json`).json()) as {
    faqTermIds: string[];
  };
  const lesson = await Bun.file(`${import.meta.dir}/../lessons/${directory}/index.html`).text();
  const panel = await panelFile.text();

  expect(panel).toContain('const catalogUrl = "/glossary/faq.json"');
  expect(panel).toContain("faq-shell");
  expect(panel).toContain("继续学习");
  expect(lesson).toContain('src="/glossary/faq-panel.js"');
  expect(lesson).toContain('id="faqCatalogButton"');
  expect(manifest.faqTermIds.length).toBeGreaterThan(0);

  for (const id of manifest.faqTermIds) {
    expect(catalogIds.has(id)).toBe(true);
    expect(lesson).toContain(`data-faq="${id}"`);
  }

  for (const id of extraIds) {
    expect(lesson).toContain(`data-faq="${id}"`);
  }
}

test("the shared FAQ catalog only contains basic, linkable beginner answers", async () => {
  const catalog = (await catalogFile.json()) as { terms: FaqTerm[] };
  const ids = new Set<string>();

  expect(catalog.terms.length).toBeGreaterThan(0);

  for (const term of catalog.terms) {
    expect(term.id).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(ids.has(term.id)).toBe(false);
    ids.add(term.id);
    expect(term.term.length).toBeGreaterThan(0);
    expect(term.summary.length).toBeGreaterThan(0);
    expect(term.answer.length).toBeGreaterThan(12);
    expect(term.answer.length).toBeLessThan(280);
    expect(term.remember.length).toBeGreaterThan(0);
    expect(Array.isArray(term.links)).toBe(true);
    expect(term.links.length).toBeGreaterThan(0);
    for (const link of term.links) {
      expect(link.title.length).toBeGreaterThan(0);
      expect(link.url).toMatch(/^https:\/\//);
    }
  }
});

test("S1-01 wires every declared FAQ term into the guided lesson", async () => {
  const panel = await panelFile.text();
  expect(panel).toContain(".terminal .faq-term[aria-expanded=\"true\"]");
  expect(panel).toContain("color: #0c2620");
  expect(panel).toContain("background: #f8c85f");
  await expectLessonFaqWiring("s1-01", ["gpp"]);
});

test("S1-02 wires variable and type FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s1-02", ["int", "char", "variable"]);
});

test("S1-03 wires expression FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s1-03", ["integer-division", "modulo", "parentheses"]);
});

test("S1-04 wires input-output FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s1-04", ["cin", "newline", "prompt-output"]);
});

test("S1-05 wires condition FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s1-05", ["if", "else-if", "equal-equal"]);
});

test("S1-06 wires loop FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s1-06", ["for", "while", "infinite-loop"]);
});

test("S1-07 wires nested-loop FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s1-07", ["nested-loop", "outer-loop", "break"]);
});

test("S1-08 wires debugging FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s1-08", ["compile-error", "wrong-answer", "debug-print"]);
});

test("S2-01 wires array FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s2-01", ["array", "subscript", "out-of-bounds"]);
});

test("S2-02 wires string FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s2-02", ["char", "string", "ascii"]);
});

test("S2-03 wires function FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s2-03", ["function", "parameter", "return-value"]);
});

test("S2-04 wires scope and parameter FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s2-04", ["scope", "local-variable", "pass-by-value"]);
});

test("S2-05 wires struct FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s2-05", ["struct", "member", "member-access"]);
});

test("S2-06 wires sorting FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s2-06", ["bubble-sort", "sort", "comparison-rule"]);
});

test("S2-07 wires enumeration and simulation FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s2-07", ["enumeration", "enumeration-range", "simulation"]);
});

test("S2-08 wires complexity and test-point FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s2-08", ["operation-count", "linear-time", "test-point"]);
});

test("S3-01 wires digit and GCD FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s3-01", ["digit", "gcd", "loop-invariant"]);
});

test("S3-02 wires recursion FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s3-02", ["recursion", "base-case", "call-stack"]);
});

test("S3-03 wires binary-search FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s3-03", ["binary-search", "monotonicity", "left-right-bound"]);
});

test("S3-04 wires prefix-sum FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s3-04", ["prefix-sum", "prefix-array", "range-sum"]);
});

test("S3-05 wires two-pointer and sliding-window FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s3-05", ["two-pointers", "sliding-window", "window-condition"]);
});

test("S3-06 wires greedy-choice FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s3-06", ["greedy", "selection-criterion", "counterexample"]);
});

test("S3-07 wires stack-and-queue FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s3-07", ["stack", "queue", "bracket-matching"]);
});

test("S3-08 wires dynamic-programming FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s3-08", ["dynamic-programming", "dp-state", "dp-transition"]);
});

test("S4-01 wires contest-statement FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s4-01", ["contest-program", "data-range", "sample-io"]);
});

test("S4-02 wires modeling-card FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s4-02", ["modeling-card", "known-unknown", "sample-reverse"]);
});

test("S4-03 wires simulation FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s4-03", ["state-table", "event-order", "condition-branch", "sample-trace"]);
});

test("S4-04 wires search-and-pruning FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s4-04", ["dfs", "search-tree", "backtrack", "pruning"]);
});

test("S4-05 wires sorting-search-and-mapping FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s4-05", ["data-range", "sort", "binary-search", "counting-array", "duplicate-value"]);
});

test("S4-06 wires DP-classic-model FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s4-06", ["dp-state", "dp-transition", "dp-init", "pick-or-skip", "optimal-substructure", "state-compression"]);
});

test("S4-07 wires graph-traversal FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s4-07", ["graph", "adjacency-list", "visited-marker", "dfs", "bfs-intuition", "connected-component"]);
});

test("S4-08 wires subtask-and-scoring-strategy FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s4-08", ["subtask", "partial-score", "fallback-solution", "easy-first-order", "complexity-downgrade"]);
});

test("S5-01 wires timed-solving-flow FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s5-01", ["timed-solving-flow", "problem-timing", "modeling-draft", "sample-check", "reserve-check-time"]);
});

test("S5-02 wires systematic-debug FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s5-02", ["systematic-debug", "minimal-repro", "debug-print", "assert-idea", "diff-check"]);
});

test("S5-03 wires common-trap FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s5-03", ["overflow", "long-long", "array-init", "out-of-bounds", "precedence", "equal-equal", "clean-output"]);
});

test("S5-04 wires 80-percent-strategy FAQ terms into the guided lesson", async () => {
  await expectLessonFaqWiring("s5-04", ["brute-force-baseline", "subtask", "special-case", "complexity-upgrade", "pseudo-optimization", "diff-check"]);
});
