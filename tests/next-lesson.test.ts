import { expect, test } from "bun:test";
import { lessonDirectoryName, loadCurriculum } from "../scripts/curriculum";

// 课后继续学习契约：一节课件在完成态必须能直接进入下一课，最后一课必须给出
// 课程收尾出口而不是死链或“已认证”的说法。课程顺序以 index.html 的 courseData
// 为唯一来源，页面里的下一课信息必须与它逐字对齐。
const projectRoot = `${import.meta.dir}/..`;
const lessonsRoot = `${projectRoot}/lessons`;

const curriculum = await loadCurriculum();
const lastIndex = curriculum.length - 1;

async function readPage(directory: string): Promise<string> {
  return Bun.file(`${lessonsRoot}/${directory}/index.html`).text();
}

function renderStepsBody(page: string, directory: string): string {
  const match = page.match(/function renderSteps\(\) \{([\s\S]*?)\n {6}\}/);

  if (!match) {
    throw new Error(`${directory}: unable to locate renderSteps() in index.html`);
  }

  return match[1];
}

// 返回入口元素本身（含开始标签）与它的内容；空页面会直接抛错，避免断言拿到空串。
function nextStepElement(page: string, directory: string): { element: string; content: string } {
  const match = page.match(/<nav[^>]*id="nextStep"[^>]*>([\s\S]*?)<\/nav>/);

  if (!match) {
    throw new Error(`${directory}: unable to locate the nextStep nav in index.html`);
  }

  return { element: match[0], content: match[1] };
}

// 会伪装成竞赛成绩或能力认证的说法，课件不得出现在收尾出口里。
const forbiddenClaims = ["证书", "认证", "保过", "保奖", "等级评定"];

test("每一课都在完成态提供通往下一课的继续学习入口", async () => {
  for (const [index, course] of curriculum.entries()) {
    if (index === lastIndex) continue;

    const directory = lessonDirectoryName(course.id);
    const next = curriculum[index + 1];
    const nextDirectory = lessonDirectoryName(next.id);
    const page = await readPage(directory);

    // 未完成时不显示：入口必须默认 hidden，由 renderSteps() 在推满进度后揭开。
    expect(page).toContain('id="nextStep"');
    expect(page).toMatch(/<nav[^>]*id="nextStep"[^>]*hidden/);
    expect(page).toContain("继续学习");
    expect(page).toContain('document.querySelector("#nextStep")');
    expect(renderStepsBody(page, directory)).toContain("nextStep.hidden =");

    // 下一步必须就是 courseData 里的下一课，且链接能在磁盘上找到。
    expect(page.match(/data-next-lesson="/g)?.length).toBe(1);
    expect(page).toContain(`data-next-lesson="${next.id}"`);
    expect(page).toContain(`href="../${nextDirectory}/index.html"`);
    expect(await Bun.file(`${lessonsRoot}/${nextDirectory}/index.html`).exists()).toBe(true);

    // 学习者要能看出下一课是第几课、讲什么，而不是只看到一个“继续”。
    const nav = nextStepElement(page, directory);
    expect(nav.content).toContain(next.id);
    expect(nav.content).toContain(next.title);
    // 下一课的预告直接取自该课第一条学习目标，不能另写一套可能过期的话。
    expect(nav.content).toContain(next.objectives[0]);
  }
});

test("最后一课给出课程收尾出口，不指向不存在的下一课", async () => {
  const course = curriculum[lastIndex];
  const directory = lessonDirectoryName(course.id);
  const page = await readPage(directory);
  const nav = nextStepElement(page, directory);

  expect(page).toContain('id="nextStep"');
  expect(page).toMatch(/<nav[^>]*id="nextStep"[^>]*hidden/);
  expect(renderStepsBody(page, directory)).toContain("nextStep.hidden =");
  expect(page).not.toContain("data-next-lesson=");
  // 没有下一课目录可指，就不能留下指向兄弟课目录的死链。
  expect(page).not.toMatch(/href="\.\.\/s\d/);
  expect(nav.element).toContain("data-course-complete");

  // 收尾出口要指向课程路线，且如实说明五阶段 40 课已经走完。
  expect(nav.content).toContain('href="../../index.html"');
  expect(nav.content).toContain(`${curriculum.length} 课`);

  for (const claim of forbiddenClaims) {
    expect(nav.content).not.toContain(claim);
  }

  // 收尾要说清“接下来做什么”，而不是停在“你完成了”。
  expect(nav.content).toContain("复盘");
  expect(nav.content).toContain("已通过校验");
});

test("下一课入口排在视频交付边界之后，不在任务面板中间打断学习", async () => {
  for (const course of curriculum) {
    const directory = lessonDirectoryName(course.id);
    const page = await readPage(directory);

    const boundaryIndex = page.indexOf('<aside class="external-boundary">');
    const nextStepIndex = page.indexOf('id="nextStep"');

    expect(boundaryIndex).toBeGreaterThan(-1);
    expect(nextStepIndex).toBeGreaterThan(boundaryIndex);
    // 每个页面只放一个入口，避免出现两处互相矛盾的“下一课”。
    expect(page.match(/id="nextStep"/g)?.length).toBe(1);
  }
});
