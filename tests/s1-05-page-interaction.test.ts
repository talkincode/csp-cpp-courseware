import { expect, test } from "bun:test";

// The guided lesson keeps all of its behavior in one inline script. bun test
// can verify the strings, but not that clicking a real button updates the
// learner-visible feedback without throwing. This harness boots that script
// against a tiny DOM stub and drives the typed-condition task end to end.

const pageSource = await Bun.file(`${import.meta.dir}/../lessons/s1-05/index.html`).text();
const inlineScript = pageSource.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";

test("the lesson page has an inline script to boot", () => {
  expect(inlineScript.length).toBeGreaterThan(0);
});

type Listener = (event?: { key: string; preventDefault: () => void }) => void;

class StubElement {
  id = "";
  textContent = "";
  innerHTML = "";
  value = "";
  hidden = false;
  disabled = false;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  style = { setProperty: (_name: string, _value: string) => {} };
  private classes = new Set<string>();
  listeners: Record<string, Listener[]> = {};

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

  addEventListener(type: string, listener: Listener) {
    (this.listeners[type] ??= []).push(listener);
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  append() {}

  remove() {}

  removeAttribute(name: string) {
    delete this.attributes[name];
  }

  click() {
    for (const listener of this.listeners.click ?? []) listener();
  }

  pressEnter() {
    const event = { key: "Enter", preventDefault: () => {} };
    for (const listener of this.listeners.keydown ?? []) listener(event);
  }

  scrollIntoView() {}
}

function bootLesson() {
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

  const documentStub = {
    querySelector: (selector: string) => element(selector),
    querySelectorAll: () => [] as StubElement[],
    createElement: () => new StubElement(),
    get activeElement() {
      return undefined;
    },
  };

  const windowStub = {
    localStorage: {
      getItem: (key: string) => stored[key] ?? null,
      setItem: (key: string, value: string) => void (stored[key] = value),
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
    AudioContext: undefined,
    webkitAudioContext: undefined,
  };

  const body = ["document", "window", "crypto"].join(",");
  const run = new Function(body, inlineScript);
  run(documentStub, windowStub, globalThis.crypto);

  return { element, stored };
}

test("clicking 检查这两行 explains a wrong condition and then unlocks the quiz", () => {
  const { element, stored } = bootLesson();

  const first = element("#microIf");
  const second = element("#microElseIf");
  const feedback = element("#microFeedback");
  const checkButton = element("#microCheckButton");

  first.value = "score > 90";
  second.value = "score >= 60";
  checkButton.click();

  expect(feedback.textContent).toContain("包含等于");
  expect(feedback.dataset.tone).toBe("error");
  expect(first.disabled).toBe(false);

  first.value = "score >= 90";
  checkButton.click();

  expect(feedback.textContent).toContain("两行条件都写对了");
  expect(first.disabled).toBe(true);
  expect(first.classList.contains("is-correct")).toBe(true);
  expect(stored["csp-cpp-s1-05-progress-v1"]).toContain('"microSolved":true');
});

test("the hint, reference and reset fallbacks never leave the learner stuck", () => {
  const { element, stored } = bootLesson();

  const first = element("#microIf");
  const second = element("#microElseIf");
  const reference = element("#microRef");

  element("#microHintButton").click();
  expect(element("#microFeedback").textContent).toContain("提示");

  // The stub does not parse the HTML, so assert that the button toggles the
  // reference block both ways instead of relying on its markup default.
  const initiallyHidden = reference.hidden;
  element("#microRefButton").click();
  expect(reference.hidden).toBe(!initiallyHidden);
  element("#microRefButton").click();
  expect(reference.hidden).toBe(initiallyHidden);

  first.value = "score >= 90";
  second.value = "score >= 60";
  element("#microResetButton").click();

  expect(first.value).toBe("");
  expect(second.value).toBe("");
  expect(first.classList.contains("is-correct")).toBe(false);
  expect(stored["csp-cpp-s1-05-progress-v1"]).toContain('"microIf":""');
});

test("pressing Enter checks the condition instead of switching tasks", () => {
  const { element } = bootLesson();

  const first = element("#microIf");
  const second = element("#microElseIf");

  first.value = "score = 90";
  second.value = "score >= 60";
  first.pressEnter();

  expect(element("#microFeedback").textContent).toContain("放进变量");
  expect(element("#microFeedback").dataset.tone).toBe("error");
});

test("rewriting after a correct answer clears the finished state so the learner can retry", () => {
  const { element, stored } = bootLesson();

  const first = element("#microIf");
  const second = element("#microElseIf");

  first.value = "score >= 90";
  second.value = "score >= 60";
  element("#microCheckButton").click();
  expect(first.disabled).toBe(true);

  element("#microResetButton").click();

  expect(first.disabled).toBe(false);
  expect(second.disabled).toBe(false);
  expect(stored["csp-cpp-s1-05-progress-v1"]).toContain('"microSolved":false');
});
