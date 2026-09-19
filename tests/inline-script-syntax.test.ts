import { expect, test } from "bun:test";

const repoRoot = `${import.meta.dir}/..`;

function extractInlineScript(source: string, file: string): string {
  const match = source.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error(`No inline <script> block found in ${file}`);
  }
  return match[1];
}

test("index.html inline script compiles as valid JavaScript", async () => {
  const source = await Bun.file(`${repoRoot}/index.html`).text();
  const body = extractInlineScript(source, "index.html");
  expect(() => new Function(body)).not.toThrow();
});

test("glossary/faq-panel.js compiles as valid JavaScript", async () => {
  const body = await Bun.file(`${repoRoot}/glossary/faq-panel.js`).text();
  expect(() => new Function(body)).not.toThrow();
});

const lessonPages = await Array.fromAsync(new Bun.Glob("lessons/*/index.html").scan(repoRoot));

test("every lesson directory has at least one interactive page to check", () => {
  expect(lessonPages.length).toBeGreaterThan(0);
});

for (const relativePath of lessonPages.sort()) {
  const lessonId = relativePath.split("/")[1];

  test(`${lessonId} inline script compiles as valid JavaScript`, async () => {
    const source = await Bun.file(`${repoRoot}/${relativePath}`).text();
    const body = extractInlineScript(source, relativePath);
    // A syntax error here means a learner's browser would fail silently or
    // throw at runtime with no test ever catching it, since the other
    // course-data tests only pattern-match strings inside the file.
    expect(() => new Function(body)).not.toThrow();
  });
}
