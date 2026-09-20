import { expect, test } from "bun:test";

// 学习尝试恢复契约：浏览器拒绝本地保存时，课件必须在当次会话里立刻说明
// “这次没保存成功”，给学习者留下重试入口，并在保存恢复后说明数据状态。
// 课件把行为都写在单个内联脚本里，字符串断言看不出真实点击后会发生什么，
// 所以这里用 DOM 桩把脚本启动起来，直接驱动真实的 saveState/retrySaving。

const repoRoot = `${import.meta.dir}/..`;

function extractInlineScript(source: string, file: string): string {
  const match = source.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error(`No inline <script> block found in ${file}`);
  }
  return match[1];
}

type Listener = (event?: unknown) => void;

class StubElement {
  id = "";
  tagName = "div";
  type = "";
  hidden = false;
  disabled = false;
  value = "";
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  style = { setProperty: (_name: string, _value: string) => {} };
  listeners: Record<string, Listener[]> = {};
  children: StubElement[] = [];
  private classes = new Set<string>();
  private text = "";

  classList = {
    add: (name: string) => void this.classes.add(name),
    remove: (...names: string[]) => names.forEach((name) => this.classes.delete(name)),
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, force?: boolean) => {
      const next = force ?? !this.classes.has(name);
      if (next) this.classes.add(name);
      else this.classes.delete(name);
      return next;
    },
  };

  // Real DOM semantics: assigning textContent drops every child node, which is
  // what keeps updateStorageNotice() from stacking retry buttons on re-render.
  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.text = value;
    this.children = [];
  }

  addEventListener(type: string, listener: Listener) {
    (this.listeners[type] ??= []).push(listener);
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  append(...nodes: (StubElement | string)[]) {
    for (const node of nodes) {
      if (typeof node === "string") this.text += node;
      else this.children.push(node);
    }
  }

  remove() {}

  removeAttribute(name: string) {
    delete this.attributes[name];
  }

  click() {
    for (const listener of this.listeners.click ?? []) listener();
  }

  scrollIntoView() {}
}

interface Harness {
  element(selector: string): StubElement;
  stored: Record<string, string>;
  blockStorage(): void;
  unblockStorage(): void;
  clickableElements(): StubElement[];
  retryControl(notice: StubElement): StubElement | undefined;
  boot(): void;
  saveState(): boolean;
  retrySaving(): boolean;
  isStorageAvailable(): boolean;
}

interface ExportTail {
  save: string;
  retry: string;
  available: string;
}

const lessonExports: ExportTail = {
  save: "saveState",
  retry: "retrySaving",
  available: "storageAvailable",
};

const dashboardExports: ExportTail = {
  save: "saveProgress",
  retry: "retrySavingProgress",
  available: "state.storageAvailable",
};

function createHarness(script: string, exports: ExportTail): Harness {
  const elements = new Map<string, StubElement>();
  const element = (selector: string) => {
    const existing = elements.get(selector);
    if (existing) return existing;
    const created = new StubElement();
    created.id = selector.replace(/^#/, "");
    elements.set(selector, created);
    return created;
  };

  const stored: Record<string, string> = {};
  let storageBlocked = false;
  const guard = () => {
    if (storageBlocked) throw new Error("storage blocked for test");
  };

  const documentStub = {
    querySelector: (selector: string) => element(selector),
    querySelectorAll: () => [] as StubElement[],
    createElement: (tagName: string) => {
      const created = new StubElement();
      created.tagName = tagName;
      return created;
    },
    get activeElement() {
      return undefined;
    },
  };

  const windowStub = {
    localStorage: {
      getItem: (key: string) => {
        guard();
        return stored[key] ?? null;
      },
      setItem: (key: string, value: string) => {
        guard();
        stored[key] = value;
      },
      removeItem: (key: string) => {
        guard();
        delete stored[key];
      },
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
    AudioContext: undefined,
    webkitAudioContext: undefined,
  };

  const factory = new Function(
    ["document", "window", "crypto"].join(","),
    `${script}\n;return { saveState: ${exports.save}, retrySaving: ${exports.retry}, isStorageAvailable: () => ${exports.available} };`,
  );

  let internals: { saveState: () => boolean; retrySaving: () => boolean; isStorageAvailable: () => boolean } | undefined;

  return {
    element,
    stored,
    blockStorage: () => void (storageBlocked = true),
    unblockStorage: () => void (storageBlocked = false),
    clickableElements: () => [...elements.values()].filter((candidate) => (candidate.listeners.click ?? []).length > 0),
    retryControl: (notice) => notice.children.find((child) => child.dataset.retryStorageSave !== undefined),
    boot: () => {
      internals = factory(documentStub, windowStub, globalThis.crypto);
    },
    saveState: () => internals!.saveState(),
    retrySaving: () => internals!.retrySaving(),
    isStorageAvailable: () => internals!.isStorageAvailable(),
  };
}

const lessonPages = await Array.fromAsync(new Bun.Glob("lessons/*/index.html").scan(repoRoot));
const lessonIds = lessonPages.map((relativePath) => relativePath.split("/")[1]).sort();

async function bootLessonPage(relativePath: string): Promise<Harness> {
  const source = await Bun.file(`${repoRoot}/${relativePath}`).text();
  const harness = createHarness(extractInlineScript(source, relativePath), lessonExports);
  harness.boot();
  return harness;
}

test("every lesson page is exercised by the storage-recovery contract", () => {
  expect(lessonIds.length).toBe(40);
});

for (const lessonId of lessonIds) {
  test(`${lessonId} 保存失败在当次会话立即可见且不伪造成功`, async () => {
    const harness = await bootLessonPage(`lessons/${lessonId}/index.html`);
    const notice = harness.element("#storageNotice");
    const ribbon = harness.element("#completionRibbon");

    expect(harness.isStorageAvailable()).toBe(true);
    expect(notice.hidden).toBe(true);

    harness.blockStorage();
    expect(harness.saveState()).toBe(false);

    expect(harness.isStorageAvailable()).toBe(false);
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain("仍可继续");
    expect(notice.textContent).toContain("刷新页面后不会恢复进度");
    expect(ribbon.textContent).toContain("没有保存成功");
    expect(ribbon.textContent).toContain("仍可继续");
  });

  test(`${lessonId} 保存失败后仍可继续互动并提出重试`, async () => {
    const harness = await bootLessonPage(`lessons/${lessonId}/index.html`);
    const notice = harness.element("#storageNotice");

    harness.blockStorage();
    harness.saveState();

    expect(notice.hidden).toBe(false);
    expect(harness.clickableElements().length).toBeGreaterThan(0);
    expect(() => harness.clickableElements().forEach((candidate) => candidate.click())).not.toThrow();
    expect(notice.hidden).toBe(false);

    const retry = harness.retryControl(notice);
    expect(retry).toBeDefined();
    expect(retry!.tagName).toBe("button");
    expect(retry!.type).toBe("button");
    expect(retry!.textContent).toContain("重试保存");

    const ribbon = harness.element("#completionRibbon");
    retry!.click();
    expect(ribbon.textContent).toContain("仍然拒绝保存");
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain("刷新页面后不会恢复进度");
  });

  test(`${lessonId} 保存恢复后说明数据状态并继续保存`, async () => {
    const harness = await bootLessonPage(`lessons/${lessonId}/index.html`);
    const notice = harness.element("#storageNotice");
    const ribbon = harness.element("#completionRibbon");

    harness.blockStorage();
    harness.saveState();

    harness.unblockStorage();
    harness.retryControl(notice)!.click();

    expect(harness.isStorageAvailable()).toBe(true);
    expect(notice.hidden).toBe(true);
    expect(ribbon.textContent).toContain("已恢复");
    expect(Object.values(harness.stored).some((value) => value.includes("\"activeStep\""))).toBe(true);

    // 之后的普通交互不再提示失败，说明保存真的恢复了。
    harness.blockStorage();
    harness.unblockStorage();
    expect(harness.saveState()).toBe(true);
    expect(notice.hidden).toBe(true);
  });
}

test("dashboard 保存失败当次会话可见并可重试恢复", async () => {
  const source = await Bun.file(`${repoRoot}/index.html`).text();
  const harness = createHarness(extractInlineScript(source, "index.html"), dashboardExports);
  harness.boot();

  const notice = harness.element("#storageNotice");
  const ribbon = harness.element("#interactionNotice");

  expect(notice.hidden).toBe(true);

  harness.blockStorage();
  expect(harness.saveState()).toBe(false);
  expect(notice.hidden).toBe(false);
  expect(notice.textContent).toContain("仅保留在当前会话");
  expect(notice.textContent).toContain("仍可阅读和勾选");
  expect(ribbon.textContent).toContain("没有保存成功");

  const retry = harness.retryControl(notice);
  expect(retry).toBeDefined();
  expect(retry!.type).toBe("button");
  expect(retry!.textContent).toContain("重试保存");

  harness.unblockStorage();
  retry!.click();

  expect(notice.hidden).toBe(true);
  expect(ribbon.textContent).toContain("已恢复");
  expect(Object.keys(harness.stored)).toContain("csp-cpp-courseware-progress-v2");
});
