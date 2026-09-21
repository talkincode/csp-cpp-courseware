import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { lessonFlows } from "./e2e/lesson-flows.ts";

// 历史轮次反复漏改过 `bun run e2e:flow` 的项数：脚本加了检查（17 → 19）或换了覆盖范围
// （17 课 → 39 课），docstring、速查清单、README 与验收矩阵里的旧数字却留着，读文档的人
// 会拿到过期事实。这里把文档里的数字绑回脚本自己的声明，改漏任何一处都当场失败。
//
// 只认「当前事实」的句子：各课的「自动化复验记录」表记的是那次复验当天的脚本覆盖范围，
// 旧数字在那里是正确的历史记录，不参与本文件的校验。
const projectRoot = `${import.meta.dir}/..`;
const flowScript = "tests/e2e/flow-cdp.ts";

function read(document: string): string {
  return readFileSync(`${projectRoot}/${document}`, "utf8");
}

/** 脚本自称每课跑几项；它跑完会拿这个数字自查，声明与实跑不符就直接失败。 */
function checksPerLesson(): number {
  const match = read(flowScript).match(/const checksPerLesson\s*=\s*(\d+)/);
  if (!match) throw new Error(`${flowScript} 里找不到 checksPerLesson 声明`);
  return Number(match[1]);
}

/** S1-01 不在这张表里：它的八个场景由 `s1-01-cdp.ts` 单独复验。 */
function coveredLessons(): number {
  return lessonFlows.length;
}

type Claims = { perLesson: number[]; total: number[] };

function collect(source: string): Claims {
  const perLesson: number[] = [];
  const total: number[] = [];

  for (const match of source.matchAll(/每课\s*(\d+)\s*项/g)) perLesson.push(Number(match[1]));
  for (const match of source.matchAll(/共\s*(\d+)\s*项|(?<![\d/])(\d+)\s*项检查/g)) {
    total.push(Number(match[1] ?? match[2]));
  }

  return { perLesson, total };
}

/**
 * 只认 `e2e:flow` 后面那一小段里的数字，并截到下一个脚本名之前。
 * 同一句里常常同时写 `e2e:typed`（659 项）与 `e2e:flow`（741 项），不切开就会张冠李戴。
 */
function flowContextClaims(document: string): Claims[] {
  const source = read(document);
  const contexts: Claims[] = [];

  for (const match of source.matchAll(/e2e:flow(?![\w:])/g)) {
    const start = match.index + match[0].length;
    const window = source.slice(start, start + 320);
    contexts.push(collect(window.split(/e2e:[a-z0-9-]+/)[0]));
  }

  return contexts;
}

const proseDocuments = [
  "tests/e2e/manual-checklist.md",
  "docs/roadmap.md",
  "docs/feature-checklist.md",
  "README.md",
];

test("每个 e2e:flow 段落写的每课项数与 checksPerLesson 一致", () => {
  const actual = checksPerLesson();
  expect(actual).toBeGreaterThan(0);

  for (const document of proseDocuments) {
    const contexts = flowContextClaims(document);
    expect({ document, hasContext: contexts.length > 0 }).toEqual({ document, hasContext: true });

    for (const context of contexts) {
      for (const claim of context.perLesson) {
        expect({ document, claim }).toEqual({ document, claim: actual });
      }
    }
  }
});

test("每个 e2e:flow 段落写的整段项数与「课程数 × 每课项数」一致", () => {
  const actual = checksPerLesson() * coveredLessons();

  for (const document of proseDocuments) {
    for (const context of flowContextClaims(document)) {
      for (const claim of context.total) {
        expect({ document, claim }).toEqual({ document, claim: actual });
      }
    }
  }
});

test("flow-cdp.ts docstring 里的数字与 checksPerLesson 一致", () => {
  const source = read(flowScript);
  const { perLesson, total } = collect(source);
  const wholeRun = checksPerLesson() * coveredLessons();

  expect(perLesson.length).toBeGreaterThan(0);
  expect(total.length).toBeGreaterThan(0);
  for (const claim of perLesson) expect(claim).toBe(checksPerLesson());
  for (const claim of total) expect(claim).toBe(wholeRun);

  expect(source).toContain("全部三十九课");
});

test("39 节已迁移课每课都写了本课占几项，数字与 checksPerLesson 一致", () => {
  const actual = checksPerLesson();
  const wholeRun = checksPerLesson() * coveredLessons();

  for (const lesson of lessonFlows) {
    const document = `tests/e2e/${lesson.directory}-manual-checklist.md`;
    const source = read(document);

    const claimed = source.match(/本课占\s*(\d+)\s*项/);
    if (!claimed) throw new Error(`${document} 里找不到「本课占 N 项」`);
    expect({ document, claim: Number(claimed[1]) }).toEqual({ document, claim: actual });

    // 记录 flow 复验的那一行必须同时说清本课项数与整段总数。
    const row = source.split("\n").find((line) => line.includes("flow-cdp.ts"));
    if (!row) throw new Error(`${document} 的自动化复验记录里找不到 flow-cdp.ts 那一行`);
    expect({ document, hasPerLesson: row.includes(`本课 ${actual} 项`) }).toEqual({ document, hasPerLesson: true });
    expect({ document, hasWholeRun: row.includes(`全程 ${wholeRun}/${wholeRun}`) }).toEqual({
      document,
      hasWholeRun: true,
    });
  }
});

test("flow 清单的固定项编号与每课项数对齐，且没有重号", () => {
  const actual = checksPerLesson();
  const document = "tests/e2e/flow-manual-checklist.md";
  const source = read(document);

  const heading = source.match(/## 每课固定复验的\s*(\d+)\s*项/);
  if (!heading) throw new Error(`${document} 里找不到「每课固定复验的 N 项」标题`);
  expect(Number(heading[1])).toBe(actual);

  // 编号只取标题之后、下一个二级标题之前的那一段，避免把场景步骤也算进来。
  const section = source.slice(heading.index! + heading[0].length).split(/\n##\s/)[0];
  const numbers = [...section.matchAll(/^\s*(\d+)\.\s/gm)].map((entry) => Number(entry[1]));
  expect(numbers).toEqual(Array.from({ length: actual }, (_, index) => index + 1));
});

test("flow 清单的自动化复验记录保留历史结果，并新增本轮的整段结果", () => {
  const document = "tests/e2e/flow-manual-checklist.md";
  const rows = read(document)
    .split("\n")
    .filter((line) => line.startsWith("|") && line.includes("flow-cdp.ts"));
  const wholeRun = checksPerLesson() * coveredLessons();

  expect(rows.length).toBeGreaterThanOrEqual(2);
  expect(rows[rows.length - 1]).toContain(`${wholeRun}/${wholeRun} 项检查通过`);
  // 表里沿用「39 课各 N 项」的写法，与 docstring 的「每课 N 项」等价。
  expect(rows[rows.length - 1]).toContain(`各 ${checksPerLesson()} 项`);
});

// ── 手写填空与 S1-01 段：同一类数字漂移 ────────────────────────────────────────
// README、速查清单与验收矩阵长期把 S2 至 S5 四段手写填空写成「128 项检查」「每课 16 项」，
// 而脚本里每课固定 16 项、有揭晓步骤的课（默认三步演示，只有 S1-03 这类显式留空）再多一项，
// 四段实跑都是 136 项；验收矩阵还漏了 S1-02 至 S3-08 这 23 课的微编程复验记录。
// 这里把这些数字绑回脚本自己的声明。
const typedScript = "tests/e2e/s2-typed-cdp.ts";
const singleLessonScript = "tests/e2e/s1-01-cdp.ts";

function declaration(document: string, name: string): number {
  const match = read(document).match(new RegExp(`const ${name}\\s*=\\s*(\\d+)`));
  if (!match) throw new Error(`${document} 里找不到 ${name} 声明`);
  return Number(match[1]);
}

type PerLessonClaim = { lowest: number; highest: number; phases?: [number, number] };
type CountClaims = { totals: number[]; perLesson: PerLessonClaim[] };

/**
 * 取命令名后面那一小段里的项数。命令之间要切开（同一句里常同时写
 * `e2e:s1-typed`（115 项）与 `e2e:s2-typed`（136 项）），表格行的数字也不能算到下一行头上。
 */
function claimsAfter(document: string, marker: string): CountClaims {
  const source = read(document);
  const claims: CountClaims = { totals: [], perLesson: [] };
  const pattern = new RegExp(`${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w:])`, "g");

  for (const match of source.matchAll(pattern)) {
    const start = match.index + match[0].length;
    const raw = source.slice(start, start + 1200);
    const stops = [raw.search(/e2e:[a-z0-9-]+/), raw.search(/\n\|/)].filter((index) => index >= 0);
    const window = raw.slice(0, stops.length > 0 ? Math.min(...stops) : raw.length);

    for (const entry of window.matchAll(/(\d+)\s*项(?:浏览器)?检查|(\d+)\s*项断言/g)) {
      claims.totals.push(Number(entry[1] ?? entry[2]));
    }
    // 「S2 至 S5 每课 17 项」按那几个阶段算；「每课 16 至 17 项」按整段算。
    for (const entry of window.matchAll(/(?:S(\d)\s*至\s*S(\d)\s*)?每课\s*(\d+)\s*项(?:至\s*(\d+)\s*项)?/g)) {
      claims.perLesson.push({
        lowest: Number(entry[3]),
        highest: Number(entry[4] ?? entry[3]),
        phases: entry[1] ? [Number(entry[1]), Number(entry[2])] : undefined,
      });
    }
  }

  return claims;
}

/** 每课项数：所有课共 base 项；显式写 `revealButtons: []` 的课没有揭晓步骤，少一项。 */
function typedChecksPerLesson(lesson: (typeof lessonFlows)[number]): number {
  const base = declaration(typedScript, "checksPerLessonWithoutReveal");
  const extra = declaration(typedScript, "revealExtraChecks");
  return lesson.revealButtons?.length === 0 ? base : base + extra;
}

/** lane 覆盖哪些课：取 package.json 里的实际命令，测试不另写一份课程表。 */
function laneDirectories(lane: string): string[] {
  if (lane === "typed") return lessonFlows.map((lesson) => lesson.directory);

  const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
  const command = scripts[`e2e:${lane}`];
  if (!command) throw new Error(`package.json 里找不到 e2e:${lane}`);
  const listed = command.match(/CSP_E2E_LESSONS=([\w,-]+)/);
  if (!listed) throw new Error(`e2e:${lane} 没有用 CSP_E2E_LESSONS 指定课程`);
  return listed[1].split(",").filter((value) => value.length > 0);
}

function laneCounts(lane: string): { total: number; lessonTotals: { phase: number; checks: number }[] } {
  const lessonTotals = laneDirectories(lane).map((directory) => {
    const lesson = lessonFlows.find((entry) => entry.directory === directory);
    if (!lesson) throw new Error(`e2e:${lane} 里的 ${directory} 不在 lesson-flows.ts 里`);
    return { phase: Number(directory.slice(1, 2)), checks: typedChecksPerLesson(lesson) };
  });

  return { total: lessonTotals.reduce((sum, entry) => sum + entry.checks, 0), lessonTotals };
}

const typedLanes = ["s1-typed", "s2-typed", "s3-typed", "s4-typed", "s5-typed", "typed"];
const typedDocuments = ["README.md", "tests/e2e/manual-checklist.md", "docs/roadmap.md"];

test("每条手写填空命令后面写的项数与「该 lane 课程 × 每课项数」一致", () => {
  for (const lane of typedLanes) {
    const { total, lessonTotals } = laneCounts(lane);
    // 整段汇总那条命令只在 README 与矩阵里逐课说项数，速查清单里只是顺带提一句。
    const required = lane === "typed" ? ["README.md", "docs/roadmap.md"] : typedDocuments;

    for (const document of typedDocuments) {
      const claims = claimsAfter(document, `e2e:${lane}`);

      if (required.includes(document)) {
        expect({ document, lane, claimed: claims.totals.length > 0 }).toEqual({ document, lane, claimed: true });
      }
      for (const claim of claims.totals) expect({ document, lane, claim }).toEqual({ document, lane, claim: total });

      for (const claim of claims.perLesson) {
        const scoped = claim.phases
          ? lessonTotals.filter((entry) => entry.phase >= claim.phases![0] && entry.phase <= claim.phases![1])
          : lessonTotals;
        const written = [claim.lowest, claim.highest];
        const actual = [Math.min(...scoped.map((entry) => entry.checks)), Math.max(...scoped.map((entry) => entry.checks))];
        expect({ document, lane, written, scope: claim.phases ?? null }).toEqual({
          document,
          lane,
          written: actual,
          scope: claim.phases ?? null,
        });
      }
    }
  }
});

test("验收矩阵的样板行写全 39 课的整段项数与每课区间", () => {
  const lessonTotals = lessonFlows.map(typedChecksPerLesson);
  const total = lessonTotals.reduce((sum, value) => sum + value, 0);
  const range = [Math.min(...lessonTotals), Math.max(...lessonTotals)];

  const row = read("docs/roadmap.md")
    .split("\n")
    .find((line) => line.startsWith("| 微编程浏览器自动化复验"));
  if (!row) throw new Error("docs/roadmap.md 里找不到微编程复验的样板行");

  expect(row).toContain(`${total} 项检查覆盖 ${lessonFlows.length} 课`);
  const written = row.match(/每课\s*(\d+)\s*至\s*(\d+)\s*项/);
  if (!written) throw new Error("样板行里找不到每课区间");
  expect([Number(written[1]), Number(written[2])]).toEqual(range);
});

test("验收矩阵每课的微编程复验记录与脚本声明的每课项数一致", () => {
  const rows = read("docs/roadmap.md")
    .split("\n")
    .filter((line) => /^\| S\d-\d\d 引导式在线学习界面/.test(line));

  let checked = 0;
  for (const row of rows) {
    const id = row.match(/^\| (S\d-\d\d) /)![1];
    const lesson = lessonFlows.find((entry) => entry.directory === id.toLowerCase());

    // S1-01 不在这套样板里：它的八个场景由 `bun run e2e:s1-01` 单独复验。
    if (!lesson) {
      expect({ id, ownRun: row.includes("e2e:s1-01") }).toEqual({ id, ownRun: true });
      continue;
    }

    const claim = row.match(/微编程\s*(\d+)\s*项浏览器检查/);
    if (!claim) throw new Error(`docs/roadmap.md 的 ${id} 行没有记录微编程复验`);
    expect({ id, claim: Number(claim[1]) }).toEqual({ id, claim: typedChecksPerLesson(lesson) });
    expect({ id, lane: row.includes(`e2e:s${id[1]}-typed`) }).toEqual({ id, lane: true });
    checked += 1;
  }

  expect(checked).toBe(lessonFlows.length);
});

test("S1-01 单课复验的项数与 s1-01-cdp.ts 的声明一致", () => {
  const actual = declaration(singleLessonScript, "expectedChecks");

  for (const document of typedDocuments) {
    const claims = claimsAfter(document, "e2e:s1-01");
    for (const claim of claims.totals) expect({ document, claim }).toEqual({ document, claim: actual });
  }

  const row = read("docs/roadmap.md")
    .split("\n")
    .find((line) => line.startsWith("| 单课浏览器自动化复验"));
  if (!row) throw new Error("docs/roadmap.md 里找不到单课复验样板行");
  expect(row).toContain(`${actual} 项检查覆盖八个场景`);
});

/** 单课复验里「题库异常降级」那一段的检查项名单，逐项列在脚本里。 */
function poolFaultCheckNames(): string[] {
  const match = read(singleLessonScript).match(/const poolFaultCheckNames = \[([\s\S]*?)\];/);
  if (!match) throw new Error(`${singleLessonScript} 里找不到 poolFaultCheckNames 名单`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

test("单课复验的跳过名单与该段的实际检查逐项对齐", () => {
  const source = read(singleLessonScript);
  // 从名单声明之后再找这一段：脚本开头的说明注释里也会提到段名。
  const listAt = source.indexOf("const poolFaultCheckNames");
  if (listAt < 0) throw new Error(`${singleLessonScript} 里找不到 poolFaultCheckNames 名单`);
  const sectionAt = source.indexOf("E2E-S1-01-05", listAt);
  if (sectionAt < 0) throw new Error(`${singleLessonScript} 里找不到 E2E-S1-01-05 段`);

  // 这一段之后的 check(...) 就是题库异常降级段实际跑的检查。
  const ran = [...source.slice(sectionAt).matchAll(/check\("([^"]+)"/g)].map((item) => item[1]);
  const declared = poolFaultCheckNames();

  expect(ran.length).toBeGreaterThan(0);
  expect([...declared].sort()).toEqual([...ran].sort());
});

test("单课复验在只读来源下如实跳过题库异常降级段，而不是报失败", () => {
  const source = read(singleLessonScript);

  // 这一段要把坏题库写进 lessons/s1-01/index.html 再复验，只有被复验的页面就是本机
  // checkout 时才成立；判定必须看来源地址，不能看「有没有设置 CSP_E2E_ORIGIN」——
  // 指向自己的本地开发服务器时，注入仍然有效。
  expect(source).toMatch(/servesLocalCheckout\(origin\)/);
  // 跳过几项由名单推出来，不能再写死第二套数字，否则「88 项」和「跳过」会各说各话。
  expect(source).toMatch(/expectedChecks\s*-\s*[^;\n]*poolFaultCheckNames\.length/);
  expect(source).toContain("SKIP");
});

test("两个复验脚本都自带项数自查，声明与实跑不符会当场失败", () => {
  for (const document of [typedScript, singleLessonScript]) {
    expect({ document, selfCheck: read(document).includes("检查项数与声明不符") }).toEqual({
      document,
      selfCheck: true,
    });
  }
});

// ── 键盘可达与焦点可见段 ────────────────────────────────────────────────────
// 这一段的检查项分两层：四十课各跑一遍结构检查，另选两课只靠键盘走完整节课。
// 两层各有自己的每课项数，文档里少写一层或写错数字都会让读文档的人拿到过期事实。
const keyboardScript = "tests/e2e/keyboard-cdp.ts";
const keyboardChecklist = "tests/e2e/keyboard-manual-checklist.md";

/** 默认跑键盘深路径的那几课（`CSP_E2E_KEYBOARD_DEEP` 的默认值）。 */
function keyboardDeepLessons(): string[] {
  const match = read(keyboardScript).match(/const defaultDeepLessons\s*=\s*\[([^\]]*)\]/);
  if (!match) throw new Error(`${keyboardScript} 里找不到 defaultDeepLessons 声明`);
  return [...(match[1] ?? "").matchAll(/"([^"]+)"/g)].map((entry) => entry[1]!);
}

test("e2e:keyboard 每课项数与深路径课数都绑回脚本声明", () => {
  const perLesson = declaration(keyboardScript, "checksPerLesson");
  const perDeep = declaration(keyboardScript, "deepChecksPerLesson");
  const deepLessons = keyboardDeepLessons();
  expect(deepLessons.length).toBeGreaterThan(0);

  for (const lesson of deepLessons) {
    expect({ lesson, inFlowTable: lessonFlows.some((entry) => entry.directory === lesson) }).toEqual({
      lesson,
      inFlowTable: true,
    });
  }
});

test("键盘复验每课项数、深路径项数与总项数都写进了文档", async () => {
  const { loadCurriculum } = await import("../scripts/curriculum.ts");
  const lessonCount = (await loadCurriculum()).length;
  const perLesson = declaration(keyboardScript, "checksPerLesson");
  const perDeep = declaration(keyboardScript, "deepChecksPerLesson");
  const deepCount = keyboardDeepLessons().length;
  const total = lessonCount * perLesson + deepCount * perDeep;

  for (const document of [...proseDocuments, keyboardChecklist]) {
    const claims = claimsAfter(document, "e2e:keyboard");
    const source = read(document);

    if (document === keyboardChecklist) {
      // 清单自己就是这段复验的操作手册，不写命令名也要写清两层项数。
      expect({ document, statesPerLesson: source.includes(`${perLesson} 项`) }).toEqual({
        document,
        statesPerLesson: true,
      });
      expect({ document, statesPerDeep: source.includes(`${perDeep} 项`) }).toEqual({
        document,
        statesPerDeep: true,
      });
      expect({ document, statesLessonCount: source.includes(`${lessonCount} 课`) }).toEqual({
        document,
        statesLessonCount: true,
      });
      continue;
    }

    expect({ document, claimed: claims.totals.length > 0 }).toEqual({ document, claimed: true });
    for (const claim of claims.totals) expect({ document, claim }).toEqual({ document, claim: total });
    for (const claim of claims.perLesson) {
      const written = [claim.lowest, claim.highest];
      const allowed = [perLesson, perDeep];
      expect({ document, written, known: written.every((value) => allowed.includes(value)) }).toEqual({
        document,
        written,
        known: true,
      });
    }
  }
});

test("键盘清单的自动化复验记录保留历史结果，并新增本轮的整段结果", async () => {
  const { loadCurriculum } = await import("../scripts/curriculum.ts");
  const lessonCount = (await loadCurriculum()).length;
  const perLesson = declaration(keyboardScript, "checksPerLesson");
  const total = lessonCount * perLesson + keyboardDeepLessons().length * declaration(keyboardScript, "deepChecksPerLesson");

  const rows = read(keyboardChecklist)
    .split("\n")
    .filter((line) => line.startsWith("|") && line.includes("keyboard-cdp.ts"));

  expect(rows.length).toBeGreaterThanOrEqual(1);
  expect(rows[rows.length - 1]).toContain(`${total}/${total} 项检查通过`);
  expect(rows[rows.length - 1]).toContain(`各 ${perLesson} 项`);
});
test("键盘清单的固定项编号与脚本声明的每课项数对齐，且没有重号", () => {
  const source = read(keyboardChecklist);
  const perLesson = declaration(keyboardScript, "checksPerLesson");
  const heading = source.match(/## 每课固定复验的\s*(\d+)\s*项/);
  if (!heading) throw new Error(`${keyboardChecklist} 里找不到「每课固定复验的 N 项」标题`);
  expect(Number(heading[1])).toBe(perLesson);

  // 编号只取标题之后、下一个二级标题之前的那一段，避免把深路径那一段的编号算进来。
  const section = source.slice(heading.index! + heading[0].length).split(/\n##\s/)[0];
  const numbers = [...section.matchAll(/^\s*(\d+)\.\s/gm)].map((entry) => Number(entry[1]));
  expect(numbers).toEqual(Array.from({ length: perLesson }, (_, index) => index + 1));

  const deepHeading = source.match(/## 键盘深路径每课固定复验的\s*(\d+)\s*项/);
  if (!deepHeading) throw new Error(`${keyboardChecklist} 里找不到深路径的「N 项」标题`);
  expect(Number(deepHeading[1])).toBe(declaration(keyboardScript, "deepChecksPerLesson"));
});

test("三个复验脚本都自带项数自查，声明与实跑不符会当场失败", () => {
  for (const document of [typedScript, singleLessonScript, keyboardScript, prereqScript]) {
    expect({ document, selfCheck: read(document).includes("检查项数与声明不符") }).toEqual({
      document,
      selfCheck: true,
    });
  }
});

// ── 先修关系可见与可达段 ────────────────────────────────────────────────────
// 先修块是每课进页面第一眼看到的东西：位置、文字、链接可达、键盘可达、手机竖屏各有一项检查，
// 再加两项「检查器自己有没有空转」的自检。清单与文档里的项数绑回脚本声明，脚本加了检查而文档
// 没跟上就会当场失败——本轮就是靠这个把「每课 5 项」改回「每课 6 项」的。
const prereqScript = "tests/e2e/prereq-cdp.ts";
const prereqChecklist = "tests/e2e/prereq-manual-checklist.md";

test("先修复验的每课项数与总项数都写进了文档", async () => {
  const { loadCurriculum } = await import("../scripts/curriculum.ts");
  const lessonCount = (await loadCurriculum()).length;
  const perLesson = declaration(prereqScript, "checksPerLesson");
  const selfChecks = declaration(prereqScript, "selfChecks");
  const total = lessonCount * perLesson + selfChecks;

  for (const document of [...proseDocuments, prereqChecklist]) {
    const claims = claimsAfter(document, "e2e:prereq");

    expect({ document, claimed: claims.totals.length > 0 }).toEqual({ document, claimed: true });
    for (const claim of claims.totals) expect({ document, claim }).toEqual({ document, claim: total });
  }

  const row = read(prereqChecklist)
    .split("\n")
    .filter((line) => line.startsWith("|") && line.includes("prereq-cdp.ts"))
    .at(-1);
  if (!row) throw new Error(`${prereqChecklist} 里找不到先修复验记录`);
  expect(row).toContain(`${total}/${total} 项检查通过`);
  expect(row).toContain(`各 ${perLesson} 项`);
});

test("先修清单的固定项编号与脚本声明的每课项数对齐，且没有重号", () => {
  const source = read(prereqChecklist);
  const perLesson = declaration(prereqScript, "checksPerLesson");
  const heading = source.match(/## 每课固定复验的\s*(\d+)\s*项/);
  if (!heading) throw new Error(`${prereqChecklist} 里找不到「每课固定复验的 N 项」标题`);
  expect(Number(heading[1])).toBe(perLesson);

  const section = source.slice(heading.index! + heading[0].length).split(/\n##\s/)[0];
  const numbers = [...section.matchAll(/^\s*(\d+)\.\s/gm)].map((entry) => Number(entry[1]));
  expect(numbers).toEqual(Array.from({ length: perLesson }, (_, index) => index + 1));
});
