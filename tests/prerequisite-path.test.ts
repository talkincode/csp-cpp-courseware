import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { lessonDirectoryName, loadCurriculum } from "../scripts/curriculum";

// 先修关系契约。
//
// `docs/roadmap.md` 的「完成的样子」要求「任何一节课都能在一分钟内看出它的先修关系」，
// 但这句话此前在 courseData、lesson.json 和页面里都没有对应物：学习者点进任意一课，
// 页面上只有本课任务、必会/建议掌握/拓展三档和返回课程路线，看不出「开始之前得先会什么」。
//
// 这里把这份内容绑成一个可机读、可复算的契约：
//   1. `index.html` 的 courseData（唯一内容源）为每课登记 `prerequisites`——只写真正会被用到的
//      更早的课，不把路径上的上一课机械照抄进去（第一课明确为空）；
//   2. 每课页面在「开始第一个任务」之前就能读到先修，文字全部由 courseData 派生，
//      改一处不同步就当场失败；
//   3. 先修块是静态 HTML，不靠脚本生成——脚本坏了也照样看得见；
//   4. 首页课件详情也能读到先修，并且排在「学习目标」之前。
const projectRoot = `${import.meta.dir}/..`;
const lessonsRoot = `${projectRoot}/lessons`;

const curriculum = await loadCurriculum();
const positionOf = new Map(curriculum.map((course, index) => [course.id, index]));

function directoryOf(courseId: string): string {
  return lessonDirectoryName(courseId);
}

async function readPage(directory: string): Promise<string> {
  return Bun.file(`${lessonsRoot}/${directory}/index.html`).text();
}

// 先修块本身：从静态标记里取出来单独看，避免断言在整页里「碰巧命中」别处文字。
function prerequisiteBlock(page: string, directory: string): string {
  const match = page.match(/<aside class="prereq-note" aria-label="先修">[\s\S]*?<\/aside>/);

  if (!match) {
    throw new Error(`${directory}: 找不到先修块 aside.prereq-note`);
  }

  return match[0];
}

test("每课的先修都指向更早、真实存在的课，第一课明确没有先修", () => {
  expect(curriculum.length).toBeGreaterThan(0);

  for (const [index, course] of curriculum.entries()) {
    expect(Array.isArray(course.prerequisites)).toBe(true);

    if (index === 0) {
      // 第一课没有更早的课可指；写空数组，不能拿「无」凑一个占位的课 ID。
      expect({ id: course.id, prerequisites: course.prerequisites }).toEqual({ id: course.id, prerequisites: [] });
      continue;
    }

    expect({ id: course.id, count: course.prerequisites.length > 0 }).toEqual({ id: course.id, count: true });
    // 一屏内能读完，也逼着内容作者挑真正要用的那几课。
    expect({ id: course.id, withinCap: course.prerequisites.length <= 3 }).toEqual({ id: course.id, withinCap: true });

    for (const prerequisite of course.prerequisites) {
      const position = positionOf.get(prerequisite);

      expect({ id: course.id, prerequisite, exists: position !== undefined }).toEqual({
        id: course.id,
        prerequisite,
        exists: true,
      });
      expect({ id: course.id, prerequisite, earlier: (position ?? -1) < index }).toEqual({
        id: course.id,
        prerequisite,
        earlier: true,
      });
      expect({ id: course.id, selfReference: prerequisite === course.id }).toEqual({ id: course.id, selfReference: false });
    }

    expect({ id: course.id, duplicates: new Set(course.prerequisites).size }).toEqual({
      id: course.id,
      duplicates: course.prerequisites.length,
    });
  }
});

test("先修是作者挑出来的更早的课，不是把路径上的上一课照抄一遍", () => {
  // 纯顺序复制是最省事的写法，也会让这个字段变成「下一步」的镜像、失去先修的意义。
  // 现场按课的内容判断：确实需要紧邻上一课的课照写，不需要的不写。这里守住「有相当一部分
  // 课的先修不是紧邻上一课」，谁把它改成机械复制就会失败。
  const notAdjacent = curriculum.filter((course, index) => {
    if (index === 0) return false;
    return !course.prerequisites.includes(curriculum[index - 1].id);
  });

  expect(notAdjacent.length).toBeGreaterThanOrEqual(20);
});

test("每课在开始第一个任务之前就能读到先修，文字与 courseData 一致", async () => {
  for (const [index, course] of curriculum.entries()) {
    const directory = directoryOf(course.id);
    const page = await readPage(directory);
    const block = prerequisiteBlock(page, directory);

    // 先修要出现在「开始第一个任务」之前：学习者是在开始前决定要不要回去补课。
    expect({ directory, beforeBegin: page.indexOf(block) < page.indexOf('id="beginButton"') }).toEqual({
      directory,
      beforeBegin: true,
    });

    // 而且要贴着标题、排在介绍段落与难度图例之前：先修是「一进页面一分钟内要看到」的信息，
    // 排在长图例后面，手机竖屏下会掉到首屏之外（390x844 实测过 S5-08 掉到 1060px）。
    const headingEnd = page.indexOf("</h1>") + "</h1>".length;
    const betweenHeadingAndBlock = page.slice(headingEnd, page.indexOf(block));
    expect({ directory, rightUnderHeading: betweenHeadingAndBlock.trim() }).toEqual({
      directory,
      rightUnderHeading: "",
    });

    // 先修块是静态标记，不靠脚本生成：脚本坏了、控制台报错也照样看得见。
    const script = page.slice(page.indexOf("<script>"));
    expect({ directory, scriptMentionsPrereq: script.includes("prereq") }).toEqual({
      directory,
      scriptMentionsPrereq: false,
    });

    let expectedLinks = 0;

    for (const prerequisite of course.prerequisites) {
      const target = curriculum[positionOf.get(prerequisite) ?? -1];
      const targetDirectory = directoryOf(target.id);

      // 每一课先修都要能一眼看出「是哪一课、讲什么、要会哪件事」，并且能直接点进去。
      expect(block).toContain(`<a class="prereq-link" href="../${targetDirectory}/index.html">${target.id} ${target.title}</a>`);
      expect(block).toContain(`<span>${target.objectives[0]}</span>`);
      expectedLinks += 1;
    }

    // 路径上的上一课单独给出：它是导航，不是先修，两者写清楚才不会让人以为「上一课就一定先修」。
    if (index > 0) {
      const previous = curriculum[index - 1];
      expect(block).toContain(
        `上一课：<a class="prereq-link" href="../${directoryOf(previous.id)}/index.html">${previous.id} ${previous.title}</a>`,
      );
      expectedLinks += 1;
    }

    expect({ directory, links: block.match(/class="prereq-link"/g)?.length ?? 0 }).toEqual({ directory, links: expectedLinks });

    // 先修块的入口必须是能读出来的链接，不能只写课号让人自己去目录里找。
    expect({ directory, hasList: block.includes('<ul class="prereq-list">') }).toEqual({
      directory,
      hasList: course.prerequisites.length > 0,
    });
  }
});

test("第一课的先修块说明这是全课程第一课，且不给上一课链接", async () => {
  const first = curriculum[0];
  const page = await readPage(directoryOf(first.id));
  const block = prerequisiteBlock(page, directoryOf(first.id));

  expect(block).toContain("不用先修");
  expect(block).toContain('class="prereq-empty"');
  expect(block).not.toContain("上一课");
  expect(block).not.toContain("class=\"prereq-link\"");
});

test("首页课件详情也给出先修，并排在「学习目标」之前", () => {
  const source = readFileSync(`${projectRoot}/index.html`, "utf8");

  const prereqSection = source.indexOf('id="prerequisiteTitle"');
  const objectiveSection = source.indexOf('id="objectiveTitle"');

  expect(prereqSection).toBeGreaterThan(-1);
  expect(objectiveSection).toBeGreaterThan(-1);
  expect(prereqSection).toBeLessThan(objectiveSection);
  expect(source).toContain('<ul id="prerequisiteList"');
  // 详情里的先修同样从 courseData 派生，不另写一份会过期的文案。
  expect(source).toContain("lesson.prerequisites");
  expect(source).toContain('document.querySelector("#prerequisiteList")');

  const render = source.slice(
    source.indexOf('document.querySelector("#prerequisiteList")'),
    source.indexOf('document.querySelector("#objectiveList")'),
  );
  // 课名与「要会的那一件事」都得从 courseData 取；在这里另抄一份文案就会失败。
  expect(render).toContain("courseData.find((item) => item.id === id)");
  expect(render).toContain("${item.id} ${item.title}");
  expect(render).toContain("${item.objectives[0]}");
  expect(render).toContain("<li>这是全课程第一课：不用先修");
});
