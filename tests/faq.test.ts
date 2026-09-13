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
const lessonFile = Bun.file(`${import.meta.dir}/../lessons/s1-01/index.html`);
const manifestFile = Bun.file(`${import.meta.dir}/../lessons/s1-01/lesson.json`);

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
  const catalog = (await catalogFile.json()) as { terms: FaqTerm[] };
  const catalogIds = new Set(catalog.terms.map((term) => term.id));
  const manifest = (await manifestFile.json()) as { faqTermIds: string[] };
  const lesson = await lessonFile.text();
  const panel = await panelFile.text();

  expect(panel).toContain('const catalogUrl = "/glossary/faq.json"');
  expect(panel).toContain("faq-shell");
  expect(panel).toContain("继续学习");
  expect(panel).toContain(".terminal .faq-term[aria-expanded=\"true\"]");
  expect(panel).toContain("color: #0c2620");
  expect(panel).toContain("background: #f8c85f");
  expect(lesson).toContain('src="/glossary/faq-panel.js"');
  expect(lesson).toContain('id="faqCatalogButton"');
  expect(manifest.faqTermIds.length).toBeGreaterThan(0);

  for (const id of manifest.faqTermIds) {
    expect(catalogIds.has(id)).toBe(true);
    expect(lesson).toContain(`data-faq="${id}"`);
  }

  expect(lesson).toContain('data-faq="gpp"');
});
