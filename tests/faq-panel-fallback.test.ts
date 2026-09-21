import { expect, test } from "bun:test";
import { lessonDirectoryName, loadCurriculum } from "../scripts/curriculum";

// 词条面板「脚本没载入成功」的兜底契约。
//
// 面板脚本（`glossary/faq-panel.js`）由全部 40 节课共用，但它自己也可能根本没载入成功：
// 课程挂在子路径下时写死的 `/glossary/...` 会 404，网络中断或离线也会让请求直接失败。
// 这种情况下课件页原先一句话都没有：带虚线的词条和「常见问题」按钮点了没反应，学习者
// 只会以为课件坏了。这里守住三件事：
//   1. 课件用相对地址引入面板脚本，子路径部署也能取到；
//   2. 课件页有默认隐藏的说明区，写明这次没载入成功并给出重新载入入口；
//   3. 面板没启动时说明区会被揭开，启动成功时保持隐藏——守卫脚本用真实代码跑，不看字符串。

const projectRoot = `${import.meta.dir}/..`;
const panelScriptTag = '<script src="../../glossary/faq-panel.js"></script>';

async function lessonDirectories(): Promise<string[]> {
  const curriculum = await loadCurriculum();
  expect(curriculum.length).toBeGreaterThan(0);
  return curriculum.map((course) => lessonDirectoryName(course.id)).sort();
}

async function lessonSource(directory: string): Promise<string> {
  return Bun.file(`${projectRoot}/lessons/${directory}/index.html`).text();
}

/**
 * 取面板脚本标签后面紧跟着的那个内联守卫脚本。守卫脚本必须紧跟面板脚本，
 * 才能在面板载入失败（标签后面的脚本照常执行）时接手说明。
 */
function guardScriptOf(source: string, directory: string): string {
  const tagIndex = source.indexOf(panelScriptTag);
  if (tagIndex < 0) throw new Error(`${directory}: 找不到相对地址的词条面板脚本标签`);

  const after = source.slice(tagIndex + panelScriptTag.length);
  const match = after.match(/^\s*<script>\n([\s\S]*?)\n\s*<\/script>/);
  if (!match) throw new Error(`${directory}: 面板脚本标签后面找不到内联守卫脚本`);
  return match[1];
}

/** 用最小 DOM 桩跑真实守卫代码，返回说明区最后的隐藏状态。 */
function runGuard(guard: string, panelBooted: boolean): boolean {
  const notice = { hidden: true };
  const documentStub = {
    querySelector: (selector: string) => {
      if (selector !== "#faqPanelNotice") throw new Error(`守卫脚本查了意外的元素：${selector}`);
      return notice;
    },
  };
  const windowStub: Record<string, unknown> = {};
  if (panelBooted) windowStub.cspFaqPanel = { booted: true };

  new Function("document", "window", guard)(documentStub, windowStub);
  return notice.hidden;
}

test("全部已实现课程都用相对地址引入共享词条面板", async () => {
  const problems: string[] = [];

  for (const directory of await lessonDirectories()) {
    const source = await lessonSource(directory);
    if (!source.includes(panelScriptTag)) problems.push(`${directory}: 没有用相对地址引入面板脚本`);
    // 写死站点根目录会在子路径部署时 404，整套词条都不见了。
    if (source.includes('src="/glossary/faq-panel.js"')) problems.push(`${directory}: 仍然写死了站点根目录的面板脚本地址`);
  }

  expect(problems).toEqual([]);
});

test("每节课都有默认隐藏的词条载入说明区，且说明区排在面板脚本之前", async () => {
  const problems: string[] = [];

  for (const directory of await lessonDirectories()) {
    const source = await lessonSource(directory);
    const noticeIndex = source.indexOf('id="faqPanelNotice"');

    if (noticeIndex < 0) {
      problems.push(`${directory}: 没有词条载入说明区`);
      continue;
    }
    if (noticeIndex > source.indexOf(panelScriptTag)) problems.push(`${directory}: 说明区排在面板脚本之后，载入失败时来不及被揭开`);
    if (!/<p id="faqPanelNotice"[^>]*hidden/.test(source)) problems.push(`${directory}: 说明区没有默认隐藏`);
    if (!/<p id="faqPanelNotice"[^>]*role="status"[^>]*aria-live="polite"/.test(source)) {
      problems.push(`${directory}: 说明区没有向辅助技术播报`);
    }

    const notice = source.match(/<p id="faqPanelNotice"[\s\S]*?<\/p>/)?.[0] ?? "";
    if (!notice.includes("没有载入成功")) problems.push(`${directory}: 说明区没说清这次没载入成功`);
    if (!/href="index.html"/.test(notice)) problems.push(`${directory}: 说明区没有重新载入入口`);
    if (!notice.includes("照常")) problems.push(`${directory}: 说明区没说清课件其他互动照常可用`);
  }

  expect(problems).toEqual([]);
});

test("面板没启动时揭开说明区，启动成功时保持隐藏", async () => {
  const problems: string[] = [];

  for (const directory of await lessonDirectories()) {
    const guard = guardScriptOf(await lessonSource(directory), directory);

    // 面板脚本 404 或离线时它一直是 undefined，这时才需要说明。
    if (runGuard(guard, false) !== false) problems.push(`${directory}: 面板没启动时说明区仍然藏着`);
    // 面板正常启动时说明区不许冒出来打扰学习者。
    if (runGuard(guard, true) !== true) problems.push(`${directory}: 面板已启动却揭开了说明区`);
  }

  expect(problems).toEqual([]);
});
