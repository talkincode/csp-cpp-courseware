import { expect, test } from "bun:test";

// 词条载入失败与恢复契约。
//
// 常见问题面板（`glossary/faq-panel.js`）由全部 40 节课共用，所以这条失败路径
// 属于全课程共享能力：词条表载入失败时，课件必须当场说明“这次没载入成功”，
// 给出重新载入的入口，并且不中断课件其他互动；重新载入成功后要回到学习者
// 刚才想看的词条。面板行为都写在脚本里，字符串断言看不出真实点击后会发生
// 什么，所以这里用 DOM 桩把面板启动起来，直接驱动真实的载入与重试路径。

const repoRoot = `${import.meta.dir}/..`;

class HTMLElementStub {}

type Listener = (event?: unknown) => void;

const voidTags = new Set(["br", "hr", "img", "input", "meta", "link", "source"]);

function toCamelCase(attribute: string): string {
  return attribute.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

// 极简选择器匹配：只覆盖课件面板真正用到的 #id、.class、[attr]、tag 组合。
function matchesSelector(node: HTMLElementStubBase, selector: string): boolean {
  const tag = selector.match(/^[a-zA-Z][\w-]*/)?.[0];
  if (tag && node.tagName.toLowerCase() !== tag.toLowerCase()) return false;
  const rest = selector.slice(tag?.length ?? 0);
  for (const token of rest.match(/[.#][\w-]+|\[[\w-]+(?:="[^"]*")?\]/g) ?? []) {
    if (token.startsWith("#") && node.id !== token.slice(1)) return false;
    if (token.startsWith(".") && !node.classList.contains(token.slice(1))) return false;
    if (token.startsWith("[")) {
      const [, name, value] = token.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/) ?? [];
      if (!name || !node.hasAttribute(name)) return false;
      if (value !== undefined && node.getAttribute(name) !== value) return false;
    }
  }
  if (((tag?.length ?? 0) + (rest.match(/[.#][\w-]+|\[[\w-]+(?:="[^"]*")?\]/g)?.join("").length ?? 0)) !== selector.length) {
    throw new Error(`测试桩不支持的选择器：${selector}`);
  }
  return true;
}

class HTMLElementStubBase extends HTMLElementStub {
  id = "";
  tagName = "DIV";
  type = "";
  hidden = false;
  disabled = false;
  value = "";
  text = "";
  parent: HTMLElementStubBase | null = null;
  children: HTMLElementStubBase[] = [];
  attributes: Record<string, string> = {};
  listeners: Record<string, Listener[]> = {};
  dataset: Record<string, string> = {};
  innerHTMLText = "";
  style = { setProperty: (_name: string, _value: string) => {} };
  // 只有根节点（body）用得到：document 级监听器由根节点统一分发。
  documentListeners: Record<string, Listener[]> = {};
  private classes = new Set<string>();

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

  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.text = value;
    this.children = [];
  }

  get innerHTML(): string {
    return this.innerHTMLText;
  }

  // 真实 DOM 语义：赋值 innerHTML 会重建子节点。面板脚本依赖这个语义在
  // shell 里查到 [data-faq-*] 节点，所以桩必须真的解析这段标记。
  set innerHTML(value: string) {
    this.innerHTMLText = value;
    this.children = [];
    const stack: HTMLElementStubBase[] = [this];
    for (const match of value.matchAll(/<\/?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g)) {
      const [raw, tagName, rawAttributes, selfClosing] = match;
      if (raw.startsWith("</")) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const node = new HTMLElementStubBase();
      node.tagName = tagName.toUpperCase();
      for (const attribute of rawAttributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
        const [, name, attributeValue = ""] = attribute;
        node.attributes[name] = attributeValue;
        if (name === "hidden") node.hidden = true;
        if (name === "id") node.id = attributeValue;
        if (name === "class") attributeValue.split(/\s+/).forEach((name) => node.classList.add(name));
        if (name.startsWith("data-")) node.dataset[toCamelCase(name.slice(5))] = attributeValue;
      }
      stack[stack.length - 1].children.push(node);
      node.parent = stack[stack.length - 1];
      if (!selfClosing && !voidTags.has(tagName.toLowerCase())) stack.push(node);
    }
  }

  querySelectorAll(selector: string): HTMLElementStubBase[] {
    const found: HTMLElementStubBase[] = [];
    const walk = (node: HTMLElementStubBase) => {
      for (const child of node.children) {
        if (matchesSelector(child, selector)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }

  querySelector(selector: string): HTMLElementStubBase | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  closest(selector: string): HTMLElementStubBase | null {
    let node: HTMLElementStubBase | null = this;
    while (node) {
      if (matchesSelector(node, selector)) return node;
      node = node.parent;
    }
    return null;
  }

  addEventListener(type: string, listener: Listener) {
    (this.listeners[type] ??= []).push(listener);
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
    if (name.startsWith("data-")) this.dataset[toCamelCase(name.slice(5))] = value;
  }

  getAttribute(name: string): string | null {
    return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
  }

  hasAttribute(name: string): boolean {
    return Object.hasOwn(this.attributes, name);
  }

  removeAttribute(name: string) {
    delete this.attributes[name];
  }

  append(...nodes: (HTMLElementStubBase | string)[]) {
    for (const node of nodes) {
      if (typeof node === "string") this.text += node;
      else {
        node.parent = this;
        this.children.push(node);
      }
    }
  }

  focus() {}

  remove() {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
  }

  click() {
    const event = { target: this, preventDefault: () => {} };
    const chain: HTMLElementStubBase[] = [];
    let node: HTMLElementStubBase | null = this;
    while (node) {
      chain.push(node);
      node = node.parent;
    }
    for (const element of chain) {
      for (const listener of element.listeners.click ?? []) listener(event);
    }
    // 真实 DOM 里点击会冒泡到 document；面板就是在 document 上监听 [data-faq] 的。
    for (const listener of this.root().documentListeners.click ?? []) listener(event);
  }

  root(): HTMLElementStubBase {
    let node: HTMLElementStubBase = this;
    while (node.parent) node = node.parent;
    return node;
  }

  scrollIntoView() {}
}

type CatalogMode = "ok" | "network" | "http500";

interface Harness {
  body: HTMLElementStubBase;
  shell(): HTMLElementStubBase;
  statusNode(): HTMLElementStubBase;
  emptyNode(): HTMLElementStubBase;
  listNode(): HTMLElementStubBase;
  answerNode(): HTMLElementStubBase;
  rememberNode(): HTMLElementStubBase;
  retryControl(): HTMLElementStubBase | null;
  pageTerm(): HTMLElementStubBase;
  pageButton(): HTMLElementStubBase;
  answerFallbackClicks(): number;
  catalogRequests: string[];
  setCatalogMode(mode: CatalogMode): void;
  boot(): void;
}

const catalogPayload = {
  terms: [
    {
      id: "main",
      term: "main",
      aliases: [],
      summary: "main 是程序开始干活的地方。",
      answer: "C++ 程序从 main 开始执行。",
      remember: "程序从 main 开始跑。",
      links: [{ title: "参考", url: "https://example.org/main" }],
    },
    {
      id: "include",
      term: "#include",
      aliases: [],
      summary: "#include 把现成的工具搬进来。",
      answer: "#include 用来引入头文件。",
      remember: "要用 cout 就先 #include。",
      links: [],
    },
  ],
};

function createHarness(script: string): Harness {
  const documentListeners: Record<string, Listener[]> = {};
  const catalogRequests: string[] = [];
  let catalogMode: CatalogMode = "ok";
  let answerFallbackClicks = 0;

  const body = new HTMLElementStubBase();
  body.tagName = "BODY";
  body.dataset.faqTerms = "main include";
  body.documentListeners = documentListeners;

  const catalogButton = new HTMLElementStubBase();
  catalogButton.id = "faqCatalogButton";
  catalogButton.tagName = "BUTTON";

  const pageTerm = new HTMLElementStubBase();
  pageTerm.tagName = "BUTTON";
  pageTerm.setAttribute("data-faq", "main");

  // 课件自己的互动控件：面板载入失败时它必须照常工作。
  const pageButton = new HTMLElementStubBase();
  pageButton.id = "answerFallbackButton";
  pageButton.tagName = "BUTTON";
  pageButton.addEventListener("click", () => {
    answerFallbackClicks += 1;
  });

  body.append(catalogButton, pageTerm, pageButton);

  const documentStub = {
    body,
    head: new HTMLElementStubBase(),
    createElement: (tagName: string) => {
      const created = new HTMLElementStubBase();
      created.tagName = tagName.toUpperCase();
      return created;
    },
    querySelector: (selector: string) => body.querySelector(selector),
    querySelectorAll: (selector: string) => body.querySelectorAll(selector),
    addEventListener: (type: string, listener: Listener) => {
      (documentListeners[type] ??= []).push(listener);
    },
    get activeElement() {
      return undefined;
    },
  };

  const windowStub = {
    addEventListener: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: (callback: Listener) => {
      callback();
      return 0;
    },
    matchMedia: () => ({ matches: false }),
  };

  const fetchStub = (url: string) => {
    catalogRequests.push(url);
    if (catalogMode === "network") return Promise.reject(new Error("catalog offline"));
    if (catalogMode === "http500") {
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.reject(new Error("no body")) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(catalogPayload) });
  };

  const factory = new Function(
    "document",
    "window",
    "HTMLElement",
    "fetch",
    "requestAnimationFrame",
    `${script}`,
  );

  return {
    body,
    shell: () => body.querySelector("#faqShell")!,
    statusNode: () => body.querySelector("[data-faq-status]")!,
    emptyNode: () => body.querySelector("[data-faq-empty]")!,
    listNode: () => body.querySelector("[data-faq-list]")!,
    answerNode: () => body.querySelector("[data-faq-answer]")!,
    rememberNode: () => body.querySelector("[data-faq-remember]")!,
    retryControl: () => body.querySelector("[data-faq-retry]"),
    pageTerm: () => pageTerm,
    pageButton: () => pageButton,
    answerFallbackClicks: () => answerFallbackClicks,
    catalogRequests,
    setCatalogMode: (mode) => {
      catalogMode = mode;
    },
    boot: () => {
      factory(documentStub, windowStub, HTMLElementStub, fetchStub, windowStub.requestAnimationFrame);
    },
  };
}

const panelScript = await Bun.file(`${repoRoot}/glossary/faq-panel.js`).text();

// 面板脚本的 fetch 与 DOM 都是桩，等微任务队列走完即可看到结果。
async function settle() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function bootPanel(mode: CatalogMode = "ok"): Promise<Harness> {
  const harness = createHarness(panelScript);
  harness.setCatalogMode(mode);
  harness.boot();
  await settle();
  return harness;
}

test("词条表载入失败时当场说明并给出重新载入入口", async () => {
  const harness = await bootPanel("network");
  const shell = harness.shell();

  harness.body.querySelector("#faqCatalogButton")!.click();

  const status = harness.statusNode();
  expect(shell.hidden).toBe(false);
  expect(status.textContent).toContain("无法载入");
  expect(status.textContent).not.toContain("点课件里带虚线的词");
  expect(harness.emptyNode().hidden).toBe(false);
  expect(harness.emptyNode().textContent).toContain("仍可继续");
  expect(harness.emptyNode().textContent).toContain("重新载入词条表");

  const retry = harness.retryControl();
  expect(retry).not.toBeNull();
  expect(retry!.hidden).toBe(false);
});

test("载入结果会向辅助技术播报", async () => {
  const harness = await bootPanel("network");
  harness.body.querySelector("#faqCatalogButton")!.click();

  const status = harness.statusNode();
  expect(status.getAttribute("role")).toBe("status");
  expect(status.getAttribute("aria-live")).toBe("polite");
});

test("载入失败不中断课件其他互动", async () => {
  const harness = await bootPanel("network");
  harness.pageTerm().click();
  harness.pageButton().click();

  expect(harness.answerFallbackClicks()).toBe(1);
  expect(harness.statusNode().textContent).not.toContain("正在载入");
});

test("重新载入成功后恢复词条并收起重试入口", async () => {
  const harness = await bootPanel("network");
  harness.body.querySelector("#faqCatalogButton")!.click();
  expect(harness.retryControl()!.hidden).toBe(false);

  harness.setCatalogMode("ok");
  harness.retryControl()!.click();
  await settle();

  expect(harness.catalogRequests.length).toBe(2);
  expect(harness.retryControl()!.hidden).toBe(true);
  expect(harness.statusNode().textContent).toContain("点课件里带虚线的词");
  expect(harness.emptyNode().hidden).toBe(true);
  expect(harness.listNode().hidden).toBe(false);
  expect(harness.listNode().querySelectorAll("[data-faq]").map((chip) => chip.dataset.faq)).toEqual([
    "main",
    "include",
  ]);
});

test("重新载入成功后回到学习者刚才想看的词条", async () => {
  const harness = await bootPanel("network");
  harness.pageTerm().click();
  expect(harness.retryControl()!.hidden).toBe(false);

  harness.setCatalogMode("ok");
  harness.retryControl()!.click();
  await settle();

  expect(harness.statusNode().textContent).toContain("程序开始干活的地方");
  expect(harness.answerNode().hidden).toBe(false);
  expect(harness.rememberNode().textContent).toContain("现在记住");
});

test("词条表返回 HTTP 错误时同样进入可重试状态", async () => {
  const harness = await bootPanel("http500");
  harness.body.querySelector("#faqCatalogButton")!.click();

  expect(harness.retryControl()).not.toBeNull();
  expect(harness.retryControl()!.hidden).toBe(false);
  expect(harness.statusNode().textContent).not.toContain("正在载入");
  expect(harness.listNode().hidden).toBe(true);
});

test("重新载入再次失败时保持诚实提示并保留重试入口", async () => {
  const harness = await bootPanel("network");
  harness.body.querySelector("#faqCatalogButton")!.click();
  harness.retryControl()!.click();
  await settle();

  expect(harness.statusNode().textContent).toContain("无法载入");
  expect(harness.statusNode().textContent).not.toContain("点课件里带虚线的词");
  expect(harness.retryControl()!.hidden).toBe(false);
  expect(harness.listNode().hidden).toBe(true);
});

test("词条表正常时面板不显示重试入口", async () => {
  const harness = await bootPanel("ok");
  harness.body.querySelector("#faqCatalogButton")!.click();

  const retry = harness.retryControl();
  expect(retry === null || retry.hidden).toBe(true);
  expect(harness.emptyNode().hidden).toBe(true);
  expect(harness.statusNode().textContent).toContain("程序开始干活的地方");
});
