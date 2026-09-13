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

test("the first lesson supplies a guided interactive page and randomized choice quiz", async () => {
  const manifestFile = Bun.file(`${lessonsRoot}/s1-01/lesson.json`);
  const firstLesson = Bun.file(`${lessonsRoot}/s1-01/index.html`);

  const manifest = (await manifestFile.json()) as LessonManifest & {
    interactive: LessonManifest["interactive"] & { reviewState: string };
    assessment: LessonManifest["assessment"] & {
      choiceDominant: boolean;
      questionBankSize: number;
      questionCount: number;
    };
  };
  expect(manifest.status).toBe("implemented");
  expect(manifest.interactive.entry).toBe("index.html");
  expect(manifest.interactive.reviewState).toBe("awaiting-user-review");
  expect(manifest.assessment.mode).toBe("randomized-choice");
  expect(manifest.assessment.choiceDominant).toBe(true);
  expect(manifest.assessment.questionBankSize).toBeGreaterThan(manifest.assessment.questionCount);

  expect(await firstLesson.exists()).toBe(true);
  const source = await firstLesson.text();
  expect(source).toContain("const questionPool");
  expect(source).toContain("function questionSetForSeed");
  expect(source).toContain("crypto.getRandomValues");
  expect(source).toContain("AudioContext");
  expect(source).toContain("prefers-reduced-motion");
  expect(source).toContain('aria-disabled="true"');
  expect(source).toContain("grid-template-columns: 20px 26px minmax(0, 1fr);");
});

test("the dashboard only exposes an interactive entry for implemented lessons", async () => {
  const dashboard = await Bun.file(`${import.meta.dir}/../index.html`).text();

  expect(dashboard).toContain('const interactiveLessonAvailable = lesson.id === "S1-01";');
  expect(dashboard).toContain(".lesson-entry[hidden] {");
  expect(dashboard).toContain("display: none;");
  expect(dashboard).toContain("互动课件正在制作");
});
