import { expect, test } from "bun:test";
import { lessonDirectoryName, loadCurriculum } from "../scripts/curriculum";

const projectRoot = `${import.meta.dir}/..`;
const lessonsRoot = `${projectRoot}/lessons`;

// AGENTS.md 的微编程要求：课件不得只靠点击流转，必须留输入框让学习者亲手敲代码。
// 已经完成迁移的课件要一直守住完整契约；还没迁移的在下面显式登记，清单必须和现场精确一致——
// 这样「补完一课却忘了从清单里划掉」和「新写一课却没有输入框」都会当场失败。
const pendingTypedPractice = [
  "s4-04",
  "s4-05",
  "s4-06",
  "s4-07",
  "s4-08",
  "s5-01",
  "s5-02",
  "s5-03",
  "s5-04",
  "s5-05",
  "s5-06",
  "s5-07",
  "s5-08",
];

// 属性值里可能含 >（例如 placeholder="score >= 90" 或 cin >>），
// 所以不能用 [^>]* 截断，必须在一对引号之外找标签结尾。
function findInputTags(source: string): string[] {
  const tags: string[] = [];
  const openPattern = /<input\b/g;
  let match: RegExpExecArray | null;

  while ((match = openPattern.exec(source)) !== null) {
    let index = match.index + match[0].length;
    let quote: string | null = null;

    while (index < source.length) {
      const char = source[index];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        break;
      }
      index += 1;
    }

    tags.push(source.slice(match.index, index + 1));
  }

  return tags;
}

function findMicroInputs(source: string): string[] {
  return findInputTags(source).filter((tag) => /class="micro-input[^"]*"/.test(tag));
}

async function readLessonPages(): Promise<{ directory: string; source: string; microInputs: string[] }[]> {
  const curriculum = await loadCurriculum();
  const directories = [...new Set(curriculum.map((lesson) => lesson.id))].map((id) => lessonDirectoryName(id));

  return Promise.all(
    directories.map(async (directory) => {
      const source = await Bun.file(`${lessonsRoot}/${directory}/index.html`).text();

      return { directory, source, microInputs: findMicroInputs(source) };
    }),
  );
}

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));

  return match ? match[1] : null;
}

function extractFunctionBody(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) return "";
  const bodyStart = source.indexOf("{", start);
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart, index + 1);
    }
  }

  return "";
}

// 微编程的指正是靠正则认孩子写的字。这里把正则源码反解成「它想匹配的那串字」：
// 去掉首尾锚点，把 \+ \* \( \) \[ \] \; 这类转义还原成字面字符。
function intendedLiteral(pattern: string): string {
  return pattern
    .replace(/^\^/, "")
    .replace(/\$$/, "")
    .split(/(\\[=+*?.;,()[\]{}|<>!/-])/)
    .map((part) => (part.length === 2 && part.startsWith("\\") ? part[1] : part))
    .join("");
}

type RejectionBranch = { directory: string; fn: string; pattern: string };

function readRejectionBranches(page: { directory: string; source: string }): RejectionBranch[] {
  const branches: RejectionBranch[] = [];

  for (const match of page.source.matchAll(/function (check[A-Za-z0-9]*)\(/g)) {
    const body = extractFunctionBody(page.source, match[1]);

    for (const branch of body.matchAll(/if \(\/(.+?)\/\.test\([A-Za-z]+\)\)\s*\n\s*return \{ ok: false/g)) {
      branches.push({ directory: page.directory, fn: match[1], pattern: branch[1] });
    }
  }

  return branches;
}

const pages = await readLessonPages();

test("每节课都能读到互动页面源码", () => {
  expect(pages.length).toBe(40);
  for (const page of pages) expect(page.source.length).toBeGreaterThan(1000);
});

test("还没有微编程输入框的课件与登记的待办清单精确一致", () => {
  const missing = pages
    .filter((page) => page.microInputs.length === 0)
    .map((page) => page.directory)
    .sort();

  expect(missing).toEqual([...pendingTypedPractice].sort());
});

test("每个微编程输入框都声明了移动端输入与无障碍属性", () => {
  for (const page of pages) {
    for (const tag of page.microInputs) {
      expect({ directory: page.directory, attribute: "type", value: readAttribute(tag, "type") }).toEqual({
        directory: page.directory,
        attribute: "type",
        value: "text",
      });
      // 移动端软键盘会自动大写或纠错，C++ 关键字会被改坏，所以这几个属性是硬要求。
      expect(readAttribute(tag, "autocapitalize")).toBe("none");
      expect(readAttribute(tag, "autocorrect")).toBe("off");
      expect(readAttribute(tag, "spellcheck")).toBe("false");
      expect(readAttribute(tag, "aria-label")?.length ?? 0).toBeGreaterThan(0);
    }
  }
});

test("微编程输入框用等宽字体，并有清晰焦点态", () => {
  for (const page of pages) {
    if (page.microInputs.length === 0) continue;

    const styleBlock = page.source.match(/\.micro-input\s*\{[^}]*\}/s)?.[0] ?? "";

    // 等宽字体要显式写在输入框自己的规则里，不能只靠祖先继承——
    // 输入框一旦挪出代码块，继承来的字体就变成普通正文，C++ 符号会对不齐。
    expect({ directory: page.directory, monospace: styleBlock.includes("monospace") }).toEqual({
      directory: page.directory,
      monospace: true,
    });

    // 焦点态可以是本课专属规则，也可以是全站 input 共用的一条，但必须真的存在。
    const focusSelectors = page.source.match(/[^{}]*:focus-visible[^{}]*/g) ?? [];
    const coversInput = focusSelectors.some(
      (selector) => selector.includes(".micro-input") || /(^|[\s,])input:focus-visible/.test(selector),
    );

    expect({ directory: page.directory, coversInput }).toEqual({ directory: page.directory, coversInput: true });
  }
});

test("每个已迁移课件都提供检查、提示、参考代码与重置兜底", () => {
  for (const page of pages) {
    if (page.microInputs.length === 0) continue;

    for (const suffix of ["CheckButton", "HintButton", "RefButton", "ResetButton"]) {
      expect({ directory: page.directory, button: suffix, found: page.source.includes(suffix) }).toEqual({
        directory: page.directory,
        button: suffix,
        found: true,
      });
    }

    // 参考代码兜底要放在可展开的只读面板里，默认收起。
    expect(page.source).toMatch(/<pre[^>]*class="micro-ref"[^>]*hidden>/);
  }
});

test("每个已迁移课件都向读屏播报检查结果", () => {
  for (const page of pages) {
    if (page.microInputs.length === 0) continue;

    // 检查结果不能只变颜色，必须经 showFeedback 写进 aria-live 区域。
    const liveRegions = page.source.match(/role="status" aria-live="polite"/g) ?? [];

    expect({ directory: page.directory, announced: liveRegions.length > 0 && page.source.includes("showFeedback(") }).toEqual({
      directory: page.directory,
      announced: true,
    });
  }
});

test("每个已迁移课件都把草稿与完成状态写进本地进度", () => {
  for (const page of pages) {
    if (page.microInputs.length === 0) continue;

    // 边打边存：输入框内容要在 input 事件里落盘。
    const draftListeners = page.source.match(/addEventListener\("input"/g) ?? [];
    expect({ directory: page.directory, draftListeners: draftListeners.length }).toEqual({
      directory: page.directory,
      draftListeners: 1,
    });

    // 刷新后要能恢复草稿和「这一空已经写对」的状态，否则学习者会以为白写了。
    expect({ directory: page.directory, draft: /typeof stored\.[A-Za-z]+ === "string"/.test(page.source) }).toEqual({
      directory: page.directory,
      draft: true,
    });
    expect({ directory: page.directory, done: /stored\.[A-Za-z]+ === true/.test(page.source) }).toEqual({
      directory: page.directory,
      done: true,
    });
  }
});

test("每条只写字面量的指正正则都能匹配它想表达的那串字", () => {
  const branches = pages.flatMap((page) => readRejectionBranches(page));

  // 抽取本身要能被验证：正则写法一变、抽取失效，条数会塌下来，这里会当场报警。
  expect(branches.length).toBeGreaterThanOrEqual(40);

  // 含字符类 / 多选分支 / \d 简写的模式本来就不是字面串，反解出来对不上是正常的。
  // 剩下的“纯字面”模式如果连自己那串字都匹配不上，就是字面元字符忘了转义——
  // 典型是 \+ 写成 +，正则会把 + 当量词，这条分支永远不可达，孩子写错也得不到指正。
  const broken = branches
    .filter((branch) => {
      const bare = branch.pattern.replace(/\\./g, "");
      return !/[[\]|]/.test(bare) && !/\\[dwsDWSnrt]/.test(branch.pattern);
    })
    .filter((branch) => {
      try {
        return !new RegExp(branch.pattern).test(intendedLiteral(branch.pattern));
      } catch {
        return true;
      }
    })
    .map((branch) => `${branch.directory} ${branch.fn} /${branch.pattern}/`);

  expect(broken).toEqual([]);
});

test("课件不会把学习者在输入框里写的内容当成代码执行", () => {
  for (const page of pages) {
    for (const forbidden of ["eval(", "new Function(", "document.write("]) {
      expect({ directory: page.directory, forbidden, found: page.source.includes(forbidden) }).toEqual({
        directory: page.directory,
        forbidden,
        found: false,
      });
    }
  }
});
