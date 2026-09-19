import { expect, test } from "bun:test";
import { lessonDirectoryName, loadCurriculum } from "../scripts/curriculum";

type LessonManifest = {
  id: string;
  title: string;
  status: "planned" | "in-progress" | "implemented";
  interactive: { status: string; entry: string | null };
  assessment: { status: string; mode: string };
  video: { owner: string; status: string };
};

const lessonsRoot = `${import.meta.dir}/../lessons`;

test("every planned course owns a lesson directory and manifest", async () => {
  const curriculum = await loadCurriculum();

  for (const course of curriculum) {
    const directory = `${lessonsRoot}/${lessonDirectoryName(course.id)}`;
    const manifestFile = Bun.file(`${directory}/lesson.json`);

    expect(await manifestFile.exists()).toBe(true);
    const manifest = (await manifestFile.json()) as LessonManifest;
    expect(manifest.id).toBe(course.id);
    expect(manifest.title).toBe(course.title);
    expect(manifest.video.owner).toBe("external");
    expect(manifest.video.status).toBe("not-managed-in-this-repository");
  }
});

async function expectImplementedInteractiveLesson(directory: string) {
  const manifestFile = Bun.file(`${lessonsRoot}/${directory}/lesson.json`);
  const lessonPage = Bun.file(`${lessonsRoot}/${directory}/index.html`);

  const manifest = (await manifestFile.json()) as LessonManifest & {
    faqTermIds?: string[];
    interactive: LessonManifest["interactive"] & { reviewState: string };
    assessment: LessonManifest["assessment"] & {
      choiceDominant: boolean;
      questionBankSize: number;
      questionCount: number;
      reviewState?: string;
    };
  };
  expect(manifest.status).toBe("implemented");
  expect(manifest.interactive.status).toBe("implemented");
  expect(manifest.interactive.entry).toBe("index.html");
  expect(manifest.interactive.reviewState).toBe("awaiting-user-review");
  expect(manifest.assessment.status).toBe("implemented");
  expect(manifest.assessment.mode).toBe("randomized-choice");
  expect(manifest.assessment.choiceDominant).toBe(true);
  expect(manifest.assessment.questionCount).toBe(3);
  expect(manifest.assessment.questionBankSize).toBeGreaterThan(manifest.assessment.questionCount);
  expect(manifest.video.owner).toBe("external");
  expect(manifest.video.status).toBe("not-managed-in-this-repository");
  expect(Array.isArray(manifest.faqTermIds)).toBe(true);
  expect((manifest.faqTermIds ?? []).length).toBeGreaterThan(0);

  expect(await lessonPage.exists()).toBe(true);
  const source = await lessonPage.text();
  expect(source).toContain("const questionPool");
  expect(source).toContain("function questionSetForSeed");
  expect(source).toContain("crypto.getRandomValues");
  expect(source).toContain("AudioContext");
  expect(source).toContain("prefers-reduced-motion");
  expect(source).toContain('aria-disabled="true"');
  expect(source).toContain("grid-template-columns: 20px 26px minmax(0, 1fr);");
  expect(source).toContain('src="/glossary/faq-panel.js"');
  expect(source).toContain('id="faqCatalogButton"');
  expect(source).not.toContain("<video");
  return { manifest, source };
}

test("the first lesson supplies a guided interactive page and randomized choice quiz", async () => {
  await expectImplementedInteractiveLesson("s1-01");
});

test("S1-02 supplies a guided variable lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s1-02");

  expect(manifest.faqTermIds).toContain("int");
  expect(manifest.faqTermIds).toContain("char");
  expect(manifest.faqTermIds).toContain("variable");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S1-02"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s1-02-progress-v1");
});

test("S1-03 supplies a guided expression lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s1-03");

  expect(manifest.faqTermIds).toContain("expression");
  expect(manifest.faqTermIds).toContain("integer-division");
  expect(manifest.faqTermIds).toContain("modulo");
  expect(manifest.faqTermIds).toContain("precedence");
  expect(manifest.faqTermIds).toContain("parentheses");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S1-03"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s1-03-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("(a + b) / 2");
  expect(source).toContain("7 / 2");
  expect(source).toContain("7 % 2");
});

test("S1-04 supplies a guided input-output lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s1-04");

  expect(manifest.faqTermIds).toContain("cin");
  expect(manifest.faqTermIds).toContain("cout");
  expect(manifest.faqTermIds).toContain("newline");
  expect(manifest.faqTermIds).toContain("fixed-precision");
  expect(manifest.faqTermIds).toContain("prompt-output");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S1-04"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s1-04-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("cin >> a >> b");
  expect(source).toContain("请输入");
});

test("S1-05 supplies a guided conditional lesson with micro coding and randomized quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s1-05");

  expect(manifest.faqTermIds).toContain("if-statement");
  expect(manifest.faqTermIds).toContain("else-branch");
  expect(manifest.faqTermIds).toContain("comparison");
  expect(manifest.faqTermIds).toContain("equality");
  expect(manifest.faqTermIds).toContain("logical-op");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S1-05"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s1-05-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("score == 100");
  expect(source).toContain("score >= 90");
  expect(source).toContain("score >= 60");
  expect(source).toContain("score >= 0 && score <= 100");
  // 微编程：亲手敲键盘，含兜底与移动端防干扰属性
  expect(source).toContain('id="microIf"');
  expect(source).toContain('id="microElseIf"');
  expect(source).toContain('id="microCheckButton"');
  expect(source).toContain('id="microHintButton"');
  expect(source).toContain('id="microRefButton"');
  expect(source).toContain('id="microResetButton"');
  expect(source).toContain('autocapitalize="none"');
  expect(source).toContain('autocorrect="off"');
  expect(source).toContain('spellcheck="false"');
});

test("the dashboard only exposes an interactive entry for implemented lessons", async () => {
  const dashboard = await Bun.file(`${import.meta.dir}/../index.html`).text();

  expect(dashboard).toContain('const implementedInteractiveLessons = ["S1-01", "S1-02", "S1-03", "S1-04", "S1-05"]');
  expect(dashboard).toContain(".lesson-entry[hidden] {");
  expect(dashboard).toContain("display: none;");
  expect(dashboard).toContain("互动课件正在制作");
});
