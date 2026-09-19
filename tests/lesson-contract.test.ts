import { expect, test } from "bun:test";
import { lessonDirectoryName, loadCurriculum } from "../scripts/curriculum";

const projectRoot = `${import.meta.dir}/..`;
const lessonsRoot = `${projectRoot}/lessons`;

// 三档难度标记在题库元数据中的取值；「拓展」对应 stretch。
const tierTokens = ["required", "recommended", "stretch"];
// 选择题题型；其余题型计入非选择题，用于校验「选择题严格多于非选择题」。
const choiceTypes = ["choice", "multi-choice"];

type Question = {
  id: string;
  courseId: string;
  objective: string;
  difficulty: string;
  type: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
  source: string;
};

type LessonManifest = {
  id: string;
  title: string;
  status: string;
  interactive: { status: string; entry: string | null; reviewState?: string };
  assessment: {
    status: string;
    mode: string;
    questionCount: number;
    questionBankSize: number;
    choiceDominant?: boolean;
    reviewState?: string;
  };
  video: { owner: string; status: string };
  faqTermIds?: string[];
};

async function readManifest(directory: string): Promise<LessonManifest> {
  return Bun.file(`${lessonsRoot}/${directory}/lesson.json`).json();
}

async function readPage(directory: string): Promise<string> {
  return Bun.file(`${lessonsRoot}/${directory}/index.html`).text();
}

function extractQuestionPool(source: string, directory: string): Question[] {
  const match = source.match(/const questionPool = (\[[\s\S]*?\n {6}\]);/);

  if (!match) {
    throw new Error(`${directory}: unable to locate questionPool in index.html`);
  }

  const pool = Function(`"use strict"; return (${match[1]});`)();

  if (!Array.isArray(pool)) {
    throw new Error(`${directory}: questionPool must evaluate to an array`);
  }

  return pool as Question[];
}

test("every planned course ships the shared online-learning page and manifest contract", async () => {
  const curriculum = await loadCurriculum();
  const problems: string[] = [];

  expect(curriculum.length).toBeGreaterThan(0);

  for (const course of curriculum) {
    const directory = lessonDirectoryName(course.id);
    const manifest = await readManifest(directory);
    const source = await readPage(directory);

    const report = (detail: string) => problems.push(`${course.id}: ${detail}`);

    if (manifest.id !== course.id) report(`manifest id is ${manifest.id}`);
    if (manifest.title !== course.title) report(`manifest title is ${manifest.title}`);
    if (manifest.status !== "implemented") report(`status is ${manifest.status}`);

    if (manifest.interactive.status !== "implemented") report("interactive is not implemented");
    if (manifest.interactive.entry !== "index.html") report("interactive entry is not index.html");
    if (manifest.interactive.reviewState !== "awaiting-user-review")
      report(`interactive reviewState is ${manifest.interactive.reviewState}`);

    if (manifest.assessment.status !== "implemented") report("assessment is not implemented");
    if (manifest.assessment.mode !== "randomized-choice")
      report(`assessment mode is ${manifest.assessment.mode}`);
    if (manifest.assessment.choiceDominant !== true) report("choiceDominant is not true");
    if (manifest.assessment.reviewState !== "awaiting-user-review")
      report(`assessment reviewState is ${manifest.assessment.reviewState}`);
    if (manifest.assessment.questionCount !== 3)
      report(`questionCount is ${manifest.assessment.questionCount}`);
    if (!(manifest.assessment.questionBankSize > manifest.assessment.questionCount))
      report(
        `questionBankSize ${manifest.assessment.questionBankSize} does not exceed questionCount ${manifest.assessment.questionCount}`,
      );

    if (manifest.video.owner !== "external") report(`video owner is ${manifest.video.owner}`);
    if (manifest.video.status !== "not-managed-in-this-repository")
      report(`video status is ${manifest.video.status}`);
    if (!Array.isArray(manifest.faqTermIds) || manifest.faqTermIds.length === 0)
      report("faqTermIds is empty");

    const requiredMarkers: Array<[string, string]> = [
      ["const questionPool", "no question bank"],
      ["function questionSetForSeed", "no reproducible seed helper"],
      ["crypto.getRandomValues", "no random paper seed"],
      ["function questionsAreValid", "no question validation"],
      ["题库暂时不可用", "no empty-bank failure notice"],
      ["题目待人工审校", "no awaiting-review notice"],
      ['source: "course-plan / 自编"', "no question source"],
      ["AudioContext", "no opt-in audio"],
      ["音效", "no sound toggle"],
      ["prefers-reduced-motion", "no reduced-motion support"],
      ['aria-disabled="true"', "no disabled affordance for assistive tech"],
      ["aria-live", "no announced status region"],
      ["grid-template-columns: 20px 26px minmax(0, 1fr);", "no shared task grid layout"],
      ['src="/glossary/faq-panel.js"', "no shared FAQ panel"],
      ['id="faqCatalogButton"', "no FAQ catalog entry"],
      ["必会", "no 必会 tier"],
      ["建议掌握", "no 建议掌握 tier"],
      ["拓展", "no 拓展 tier"],
      ["不会在浏览器里运行 C++", "no boundary notice against running learner code"],
      ["分数", "no score feedback"],
      ["答对", "no per-question correctness feedback"],
      ["解析", "no explanation"],
      ["换一套", "no retry path to a fresh paper"],
      ["回看", "no review exit"],
      ["本次试卷标识", "no reproducible paper identifier"],
      [`courseId: "${course.id}"`, "questions are not linked to this course"],
      [`csp-cpp-${directory}-progress-v1`, "no browser-local progress key"],
    ];

    for (const [marker, detail] of requiredMarkers) {
      if (!source.includes(marker)) report(detail);
    }

    if (source.includes("<video")) report("must not embed a video element");
    if (source.includes("经过审校")) report("must not claim editorial review");
    if (source.includes('source: "original"')) report("questions must name a traceable source");
    if (source.replaceAll("题目待人工审校", "").includes("已审校"))
      report("must not claim editorial review");

    if (source.split("questionsAreValid").length - 1 < 3)
      report("question validation is used fewer than three times");
    if (source.split("questionPool.length === 0").length - 1 < 2)
      report("empty-bank guard is used fewer than twice");
  }

  expect(problems).toEqual([]);
});

test("every question links its course, objective, tier, type, answer, explanation and source", async () => {
  const curriculum = await loadCurriculum();
  const problems: string[] = [];

  for (const course of curriculum) {
    const directory = lessonDirectoryName(course.id);
    const manifest = await readManifest(directory);
    const questions = extractQuestionPool(await readPage(directory), directory);

    const report = (detail: string) => problems.push(`${course.id}: ${detail}`);
    const seen = new Set<string>();
    let choiceCount = 0;
    let nonChoiceCount = 0;

    if (questions.length !== manifest.assessment.questionBankSize)
      report(
        `questionBankSize is ${manifest.assessment.questionBankSize} but the bank holds ${questions.length} questions`,
      );

    for (const question of questions) {
      const label = question?.id ? question.id : "<missing id>";

      if (typeof question?.id !== "string" || question.id.length === 0) report("a question has no id");
      else if (seen.has(question.id)) report(`duplicate question id ${question.id}`);
      else seen.add(question.id);

      if (question?.courseId !== course.id) report(`${label} courseId is ${question?.courseId}`);
      if (typeof question?.objective !== "string" || question.objective.length === 0)
        report(`${label} has no objective`);
      if (!tierTokens.includes(question?.difficulty))
        report(`${label} difficulty "${question?.difficulty}" is outside ${tierTokens.join(" | ")}`);
      if (typeof question?.prompt !== "string" || question.prompt.length === 0)
        report(`${label} has no prompt`);
      if (typeof question?.explanation !== "string" || question.explanation.length === 0)
        report(`${label} has no explanation`);
      if (question?.source !== "course-plan / 自编") report(`${label} source is ${question?.source}`);

      if (!Array.isArray(question?.options) || question.options.length < 2) {
        report(`${label} needs at least two options`);
      } else if (question.options.some((option) => typeof option !== "string" || option.length === 0)) {
        report(`${label} has an empty option`);
      } else if (
        !Number.isInteger(question.answer) ||
        question.answer < 0 ||
        question.answer >= question.options.length
      ) {
        report(`${label} answer ${question.answer} is outside its options`);
      }

      if (!choiceTypes.includes(question?.type)) nonChoiceCount += 1;
      else choiceCount += 1;
    }

    if (nonChoiceCount > 0 && choiceCount <= nonChoiceCount)
      report(`choice questions (${choiceCount}) must outnumber non-choice questions (${nonChoiceCount})`);
    if (choiceCount === 0 && questions.length > 0) report("the bank holds no choice question");
  }

  expect(problems).toEqual([]);
});

test("every FAQ term a lesson page references resolves in the shared catalog and its own manifest", async () => {
  const curriculum = await loadCurriculum();
  const catalog = (await Bun.file(`${projectRoot}/glossary/faq.json`).json()) as {
    terms: Array<{ id: string }>;
  };
  const catalogIds = new Set(catalog.terms.map((term) => term.id));
  const problems: string[] = [];

  for (const course of curriculum) {
    const directory = lessonDirectoryName(course.id);
    const manifest = await readManifest(directory);
    const source = await readPage(directory);
    const declared = new Set(manifest.faqTermIds ?? []);
    const used = new Set([...source.matchAll(/data-faq="([^"]+)"/g)].map((match) => match[1]));

    const report = (detail: string) => problems.push(`${course.id}: ${detail}`);

    if (used.size === 0) report("references no FAQ term");

    for (const id of used) {
      if (!catalogIds.has(id)) report(`data-faq="${id}" is missing from glossary/faq.json`);
      if (!declared.has(id)) report(`data-faq="${id}" is not listed in lesson.json faqTermIds`);
    }

    for (const id of declared) {
      if (!catalogIds.has(id)) report(`faqTermIds "${id}" is missing from glossary/faq.json`);
      if (!used.has(id)) report(`faqTermIds "${id}" is declared but never referenced by the page`);
    }
  }

  expect(problems).toEqual([]);
});
