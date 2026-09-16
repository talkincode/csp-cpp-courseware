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

test("S1-05 supplies a guided condition lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s1-05");

  expect(manifest.faqTermIds).toContain("if");
  expect(manifest.faqTermIds).toContain("else-if");
  expect(manifest.faqTermIds).toContain("equal-equal");
  expect(manifest.faqTermIds).toContain("assignment");
  expect(manifest.faqTermIds).toContain("logical-and");
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
  expect(source).toContain("if (score >= 60)");
  expect(source).toContain("else if");
  expect(source).toContain("if (score = 60)");
});

test("S1-06 supplies a guided loop lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s1-06");

  expect(manifest.faqTermIds).toContain("for");
  expect(manifest.faqTermIds).toContain("while");
  expect(manifest.faqTermIds).toContain("loop-variable");
  expect(manifest.faqTermIds).toContain("accumulation");
  expect(manifest.faqTermIds).toContain("infinite-loop");
  expect(manifest.faqTermIds).toContain("do-while");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S1-06"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s1-06-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("for (int i = 1; i <= n; i++)");
  expect(source).toContain("sum += i");
  expect(source).toContain("i++");
});

test("S1-07 supplies a guided nested-loop lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s1-07");

  expect(manifest.faqTermIds).toContain("nested-loop");
  expect(manifest.faqTermIds).toContain("outer-loop");
  expect(manifest.faqTermIds).toContain("inner-loop");
  expect(manifest.faqTermIds).toContain("break");
  expect(manifest.faqTermIds).toContain("continue");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S1-07"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s1-07-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("for (int r = 1; r <= n; r++)");
  expect(source).toContain("for (int c = 1; c <= n; c++)");
  expect(source).toContain("break");
});

test("S1-08 supplies a guided debugging lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s1-08");

  expect(manifest.faqTermIds).toContain("compile-error");
  expect(manifest.faqTermIds).toContain("runtime-error");
  expect(manifest.faqTermIds).toContain("wrong-answer");
  expect(manifest.faqTermIds).toContain("indentation");
  expect(manifest.faqTermIds).toContain("naming");
  expect(manifest.faqTermIds).toContain("debug-print");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S1-08"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s1-08-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("cout << n");
  expect(source).toContain("n = 1");
  expect(source).toContain("gdb");
});

test("S2-01 supplies a guided array lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s2-01");

  expect(manifest.faqTermIds).toContain("array");
  expect(manifest.faqTermIds).toContain("subscript");
  expect(manifest.faqTermIds).toContain("array-length");
  expect(manifest.faqTermIds).toContain("array-init");
  expect(manifest.faqTermIds).toContain("out-of-bounds");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S2-01"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s2-01-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("int a[n]");
  expect(source).toContain("a[0]");
  expect(source).toContain("a[n - 1]");
});

test("S2-02 supplies a guided string lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s2-02");

  expect(manifest.faqTermIds).toContain("char");
  expect(manifest.faqTermIds).toContain("string");
  expect(manifest.faqTermIds).toContain("string-length");
  expect(manifest.faqTermIds).toContain("string-index");
  expect(manifest.faqTermIds).toContain("ascii");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S2-02"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s2-02-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("char c = 'A'");
  expect(source).toContain('string s = "Ada"');
  expect(source).toContain("s.size()");
  expect(source).toContain("s[0]");
  expect(source).toContain("s[n - 1]");
});

test("S2-03 supplies a guided function lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s2-03");

  expect(manifest.faqTermIds).toContain("function");
  expect(manifest.faqTermIds).toContain("parameter");
  expect(manifest.faqTermIds).toContain("return-value");
  expect(manifest.faqTermIds).toContain("function-call");
  expect(manifest.faqTermIds).toContain("function-definition");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S2-03"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s2-03-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("bool isEven(int x)");
  expect(source).toContain("return x % 2 == 0");
  expect(source).toContain("isEven(4)");
  expect(source).toContain("isLeap");
});

test("S2-04 supplies a guided scope-and-parameter lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s2-04");

  expect(manifest.faqTermIds).toContain("scope");
  expect(manifest.faqTermIds).toContain("local-variable");
  expect(manifest.faqTermIds).toContain("global-variable");
  expect(manifest.faqTermIds).toContain("pass-by-value");
  expect(manifest.faqTermIds).toContain("reference");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S2-04"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s2-04-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("void addOne(int x)");
  expect(source).toContain("addOne(n)");
  expect(source).toContain("int &x");
});

test("S2-05 supplies a guided struct-and-modeling lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s2-05");

  expect(manifest.faqTermIds).toContain("struct");
  expect(manifest.faqTermIds).toContain("member");
  expect(manifest.faqTermIds).toContain("member-access");
  expect(manifest.faqTermIds).toContain("struct-array");
  expect(manifest.faqTermIds).toContain("field-compare");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S2-05"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s2-05-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("struct Student");
  expect(source).toContain("stu.score");
  expect(source).toContain("a[i].score");
});

test("S2-06 supplies a guided sorting-and-comparison lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s2-06");

  expect(manifest.faqTermIds).toContain("bubble-sort");
  expect(manifest.faqTermIds).toContain("sort");
  expect(manifest.faqTermIds).toContain("comparison-rule");
  expect(manifest.faqTermIds).toContain("swap");
  expect(manifest.faqTermIds).toContain("stability");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S2-06"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s2-06-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("sort(a, a + n)");
  expect(source).toContain("3, 1, 2");
  expect(source).toContain("swap(a[0], a[1])");
});

test("S2-07 supplies a guided enumeration-and-simulation lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s2-07");

  expect(manifest.faqTermIds).toContain("enumeration");
  expect(manifest.faqTermIds).toContain("enumeration-range");
  expect(manifest.faqTermIds).toContain("state-update");
  expect(manifest.faqTermIds).toContain("simulation");
  expect(manifest.faqTermIds).toContain("missed-branch");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S2-07"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s2-07-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("for (int i = 1; i <= n; i++)");
  expect(source).toContain("evenCount");
  expect(source).toContain("i % 2 == 0");
});

test("S2-08 supplies a guided complexity-and-test-point lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s2-08");

  expect(manifest.faqTermIds).toContain("operation-count");
  expect(manifest.faqTermIds).toContain("linear-time");
  expect(manifest.faqTermIds).toContain("quadratic-time");
  expect(manifest.faqTermIds).toContain("boundary-data");
  expect(manifest.faqTermIds).toContain("test-point");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S2-08"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s2-08-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("for (int i = 0; i < n; i++)");
  expect(source).toContain("n * n");
  expect(source).toContain("O(n)");
});

test("S3-01 supplies a guided digit-and-gcd lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s3-01");

  expect(manifest.faqTermIds).toContain("integer-division");
  expect(manifest.faqTermIds).toContain("modulo");
  expect(manifest.faqTermIds).toContain("digit");
  expect(manifest.faqTermIds).toContain("gcd");
  expect(manifest.faqTermIds).toContain("loop-invariant");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S3-01"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s3-01-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("x % 10");
  expect(source).toContain("x / 10");
  expect(source).toContain("125");
});

test("S3-02 supplies a guided recursion-and-divide lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s3-02");

  expect(manifest.faqTermIds).toContain("recursion");
  expect(manifest.faqTermIds).toContain("base-case");
  expect(manifest.faqTermIds).toContain("recursive-call");
  expect(manifest.faqTermIds).toContain("call-stack");
  expect(manifest.faqTermIds).toContain("factorial");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S3-02"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s3-02-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("countdown(3)");
  expect(source).toContain("countdown(2)");
  expect(source).toContain("countdown(1)");
});

test("S3-03 supplies a guided binary-search lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s3-03");

  expect(manifest.faqTermIds).toContain("binary-search");
  expect(manifest.faqTermIds).toContain("monotonicity");
  expect(manifest.faqTermIds).toContain("left-right-bound");
  expect(manifest.faqTermIds).toContain("midpoint");
  expect(manifest.faqTermIds).toContain("infinite-loop");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S3-03"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s3-03-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("a[2] = 5");
  expect(source).toContain("a[3] = 7");
  expect(source).toContain("left = 3");
});

test("S3-04 supplies a guided prefix-sum lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s3-04");

  expect(manifest.faqTermIds).toContain("prefix-sum");
  expect(manifest.faqTermIds).toContain("prefix-array");
  expect(manifest.faqTermIds).toContain("range-sum");
  expect(manifest.faqTermIds).toContain("index-offset");
  expect(manifest.faqTermIds).toContain("linear-time");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S3-04"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s3-04-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("sum[2] = 7");
  expect(source).toContain("sum[4] - sum[1]");
  expect(source).toContain("sum[0] = 0");
});

test("S3-05 supplies a guided two-pointer and sliding-window lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s3-05");

  expect(manifest.faqTermIds).toContain("two-pointers");
  expect(manifest.faqTermIds).toContain("sliding-window");
  expect(manifest.faqTermIds).toContain("left-pointer");
  expect(manifest.faqTermIds).toContain("right-pointer");
  expect(manifest.faqTermIds).toContain("window-condition");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S3-05"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s3-05-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("left = 1, right = 0");
  expect(source).toContain("right = 2");
  expect(source).toContain("sum = 3");
});

test("S3-06 supplies a guided greedy-choice lesson and randomized choice quiz", async () => {
  const { source, manifest } = await expectImplementedInteractiveLesson("s3-06");

  expect(manifest.faqTermIds).toContain("greedy");
  expect(manifest.faqTermIds).toContain("selection-criterion");
  expect(manifest.faqTermIds).toContain("counterexample");
  expect(manifest.faqTermIds).toContain("sort-then-decide");
  expect(manifest.assessment.reviewState).toBe("awaiting-user-review");
  expect(source).toContain("必会");
  expect(source).toContain("建议掌握");
  expect(source).toContain("拓展");
  expect(source).toContain('courseId: "S3-06"');
  expect(source).toContain('type: "choice"');
  expect(source).toContain("不会在浏览器里运行 C++");
  expect(source).toContain("csp-cpp-s3-06-progress-v1");
  expect(source).toContain("course-plan / 自编");
  expect(source).toContain("题库暂时不可用");
  expect(source).toContain("lastEnd = 0");
  expect(source).toContain("[1, 2]");
  expect(source).toContain("[2, 5]");
});

test("the dashboard only exposes an interactive entry for implemented lessons", async () => {
  const dashboard = await Bun.file(`${import.meta.dir}/../index.html`).text();

  expect(dashboard).toContain('const implementedInteractiveLessons = ["S1-01", "S1-02", "S1-03", "S1-04", "S1-05", "S1-06", "S1-07", "S1-08", "S2-01", "S2-02", "S2-03", "S2-04", "S2-05", "S2-06", "S2-07", "S2-08", "S3-01", "S3-02", "S3-03", "S3-04", "S3-05", "S3-06"]');
  expect(dashboard).toContain(".lesson-entry[hidden] {");
  expect(dashboard).toContain("display: none;");
  expect(dashboard).toContain("互动课件正在制作");
});
