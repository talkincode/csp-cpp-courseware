#!/usr/bin/env bun
/**
 * 先修关系的浏览器复验（零依赖）。
 *
 * 用法：
 *   bun run e2e:prereq                          全部四十课：40 课 × 6 项 + 2 项自检 = 242 项
 *   CSP_E2E_PREREQ_LESSONS=s1-01,s3-04 bun tests/e2e/prereq-cdp.ts
 *
 * 与 `prerequisite-path.test.ts` 的分工：那个文件在 `bun test` 里守住静态契约（先修表合法、
 * 页面文字与 `courseData` 一致、块贴着标题且在开始按钮之前、不靠脚本生成）；这个脚本在真实
 * 浏览器里验「学习者真的能用到它」——先修块一进页面就整块落在首屏内（笔记本 1280x1000 与
 * 手机竖屏 390x844 两种视口）、每条链接真的能打开对应的那一课、只用键盘也走得到并且看得见
 * 焦点环、鼠标点下去真的进得去。
 *
 * 它不在 `bun test` 范围内：需要真实浏览器，属于体验验收，不是单元测试。
 * 手工清单与复验记录见 tests/e2e/prereq-manual-checklist.md。
 *
 * 可用环境变量覆盖默认值：
 *   CSP_E2E_PORT / CSP_E2E_CDP_PORT / CSP_E2E_CHROME / CSP_E2E_ORIGIN
 *   CSP_E2E_PREREQ_LESSONS  只跑指定课程，逗号分隔（手机视口那一项跟着一起收窄）
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lessonDirectoryName, loadCurriculum } from "../../scripts/curriculum.ts";

const projectRoot = `${import.meta.dir}/../..`;
const port = Number(Bun.env.CSP_E2E_PORT ?? 4575);
const cdpPort = Number(Bun.env.CSP_E2E_CDP_PORT ?? 9375);
const origin = Bun.env.CSP_E2E_ORIGIN ?? `http://localhost:${port}`;
const chromeCandidates = [
  Bun.env.CSP_E2E_CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter((value): value is string => typeof value === "string" && value.length > 0);

/** 结构检查每课固定 6 项（笔记本视口 5 项 + 手机竖屏 1 项）；跑完拿它自查，声明与实跑不符就直接失败。 */
const checksPerLesson = 6;
/** 页首那两项自检：插一条死链必须被抓到，以及检查后页面必须回到仓库里的样子。 */
const selfChecks = 2;
/** 键盘检查最多按多少次 Tab；先修块就在页首，前面只有顶栏控件和正文里的 FAQ 按钮，走不到就说明 Tab 顺序被改了。 */
const maxTabsToPrereq = 24;

const curriculum = await loadCurriculum();
const order = curriculum.map((course) => course.id);
const byId = new Map(curriculum.map((course) => [course.id, course]));

const splitList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const requested = splitList(Bun.env.CSP_E2E_PREREQ_LESSONS);
for (const directory of requested) {
  if (!order.map((id) => lessonDirectoryName(id)).includes(directory)) {
    console.error(`不认识这节课：${directory}`);
    process.exit(1);
  }
}

const allDirectories = order.map((id) => lessonDirectoryName(id));
const selectedLessons = requested.length > 0 ? requested : allDirectories;

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const servers: Bun.Subprocess[] = [];
const browsers: Bun.Subprocess[] = [];
const tempDirs: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function reachable(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(url: string, description: string, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await reachable(url)) return;
    await Bun.sleep(250);
  }
  throw new Error(`等待超时：${description}`);
}

function collect(stream: ReadableStream<Uint8Array> | undefined) {
  if (!stream) return;
  (async () => {
    for await (const chunk of stream) void chunk;
  })().catch(() => {});
}

async function ensureDevServer() {
  if (Bun.env.CSP_E2E_ORIGIN) return;
  if (await reachable(`${origin}/index.html`)) return;

  console.log(`启动开发服务器：${origin}`);
  const server = Bun.spawn(["bun", "scripts/dev.ts"], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port) },
    stdout: "pipe",
    stderr: "pipe",
  });
  servers.push(server);
  collect(server.stdout as ReadableStream<Uint8Array>);
  collect(server.stderr as ReadableStream<Uint8Array>);
  await waitFor(`${origin}/index.html`, "开发服务器");
}

async function ensureChrome() {
  const endpoint = `http://localhost:${cdpPort}/json/version`;
  if (await reachable(endpoint)) return;

  const binary = chromeCandidates.find((candidate) => existsSync(candidate));
  if (!binary) {
    throw new Error(`未找到 Chrome。请安装 Chrome，或用 CSP_E2E_CHROME 指定路径（已尝试：${chromeCandidates.join("、")}）。`);
  }

  const profileDir = mkdtempSync(join(tmpdir(), "csp-e2e-prereq-profile-"));
  tempDirs.push(profileDir);
  console.log(`启动无头 Chrome：${binary}`);
  const browser = Bun.spawn(
    [
      binary,
      "--headless=new",
      "--disable-gpu",
      // 固定成一台常见的笔记本：先修块必须落在首屏内，检查才有意义。
      "--window-size=1280,1000",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${cdpPort}`,
      "about:blank",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  browsers.push(browser);
  collect(browser.stdout as ReadableStream<Uint8Array>);
  collect(browser.stderr as ReadableStream<Uint8Array>);
  await waitFor(endpoint, "无头 Chrome 调试端口");
}

class Cdp {
  #socket: WebSocket;
  #pending = new Map<number, (message: any) => void>();
  #seq = 0;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.#pending.has(message.id)) {
        this.#pending.get(message.id)!(message);
        this.#pending.delete(message.id);
      }
    };
  }

  static async attach() {
    const targets = (await (await fetch(`http://localhost:${cdpPort}/json/list`)).json()) as any[];
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (!page) throw new Error("没有可用的浏览器页面目标。");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("无法连接浏览器调试通道。"));
    });
    const client = new Cdp(socket);
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    return client;
  }

  // 每次请求都必须有超时：页面正在导航时 Chrome 会把旧执行上下文里的
  // `Runtime.evaluate` 直接丢掉，回应永远不会来，没有超时就会整段挂死。
  send(method: string, params: Record<string, unknown> = {}, timeoutMs = 10000) {
    const id = ++this.#seq;
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`${method} 在 ${timeoutMs}ms 内没有回应`));
      }, timeoutMs);
      this.#pending.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const message = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (message.result?.exceptionDetails) {
      throw new Error(`页面抛出异常：${JSON.stringify(message.result.exceptionDetails).slice(0, 400)}`);
    }
    return message.result?.result?.value as T;
  }

  /** 导航途中页面可能整个换掉、求值被丢掉，这里把「这一轮没读到」当成正常的等待，不当成失败。 */
  async tryEvaluate<T = unknown>(expression: string, timeoutMs = 10000): Promise<T | null> {
    const message = await this.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true, userGesture: true },
      timeoutMs,
    ).catch(() => null);
    if (!message || message.result?.exceptionDetails) return null;
    return message.result?.result?.value as T;
  }

  async navigate(url: string) {
    // 只等 readyState 不够用：同一地址再导航时旧文档当场就报 complete，
    // 上一步点击引发的导航也可能还没落地，结果会读到上一页的 DOM。
    // 所以三件事同时成立才算到：文档换过（timeOrigin 不同）、加载完、地址就是请求的那一页。
    const expectedPath = new URL(url).pathname;
    const previousTimeOrigin = (await this.tryEvaluate<number>("performance.timeOrigin")) ?? 0;
    await this.send("Page.navigate", { url });

    const deadline = Date.now() + 20000;
    let lastSeen = "<还没读>";

    while (Date.now() < deadline) {
      const state = await this.tryEvaluate<string>("document.readyState", 2000);
      const timeOrigin = (await this.tryEvaluate<number>("performance.timeOrigin", 2000)) ?? 0;
      lastSeen = (await this.tryEvaluate<string>("location.pathname", 2000)) ?? "<这一轮读不到>";
      if (state === "complete" && timeOrigin !== previousTimeOrigin && lastSeen === expectedPath) return;
      await Bun.sleep(50);
    }

    throw new Error(`页面在 20 秒内没有停在 ${expectedPath}（最后停在 ${lastSeen}）：${url}`);
  }

  async press(key: string, code: string, virtualKeyCode: number, text?: string) {
    await this.send("Input.dispatchKeyEvent", {
      type: text ? "keyDown" : "rawKeyDown",
      key,
      code,
      windowsVirtualKeyCode: virtualKeyCode,
      nativeVirtualKeyCode: virtualKeyCode,
      ...(text ? { text, unmodifiedText: text } : {}),
    });
    await this.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
      windowsVirtualKeyCode: virtualKeyCode,
      nativeVirtualKeyCode: virtualKeyCode,
    });
    await Bun.sleep(20);
  }

  tab() {
    return this.press("Tab", "Tab", 9);
  }

  /** 真实鼠标点击：先把元素滚进视野，再在它中心按下抬起，不是 DOM 里的 .click()。 */
  async clickSelector(selector: string) {
    const box = JSON.parse(
      await this.evaluate<string>(`JSON.stringify((() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: "center", inline: "center" });
        const rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })())`),
    ) as { x: number; y: number } | null;

    if (!box) throw new Error(`页面上找不到可点击的元素：${selector}`);

    if (box) {
      for (const type of ["mousePressed", "mouseReleased"]) {
        await this.send("Input.dispatchMouseEvent", {
          type,
          x: box.x,
          y: box.y,
          button: "left",
          buttons: type === "mousePressed" ? 1 : 0,
          clickCount: 1,
        });
      }
    }

    return box;
  }

  async waitForUrl(predicate: (url: string) => boolean, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const url = await this.evaluate<string>("location.href").catch(() => null);
      if (url && predicate(url)) return url;
      await Bun.sleep(60);
    }

    return null;
  }

  close() {
    this.#socket.close();
  }
}

type BlockProbe = {
  found: boolean;
  visible: boolean;
  viewport: string;
  top: number;
  bottom: number;
  inFirstScreen: boolean;
  text: string;
  links: { href: string; text: string }[];
  anchorWarning: string | null;
};

type FocusState = { onPrereq: boolean; ring: boolean; tag: string; id?: string; cls?: string };

const readBlock = `JSON.stringify((() => {
  const block = document.querySelector("aside.prereq-note");
  const viewport = \`\${innerWidth}x\${innerHeight}\`;
  if (!block) return { found: false, visible: false, text: "", links: [], anchorWarning: null, viewport, top: -1, bottom: -1 };
  const rect = block.getBoundingClientRect();
  const style = getComputedStyle(block);
  const lastLink = block.querySelector("a.prereq-link, .prereq-empty");
  const lastRect = lastLink ? lastLink.getBoundingClientRect() : rect;
  return {
    found: true,
    visible: rect.height > 0 && rect.width > 0 && style.display !== "none" && style.visibility !== "hidden",
    viewport,
    top: Math.round(rect.top),
    bottom: Math.round(lastRect.bottom),
    inFirstScreen: rect.top >= 0 && lastRect.bottom <= innerHeight,
    text: block.textContent.replace(/\\s+/g, " ").trim(),
    links: [...block.querySelectorAll("a.prereq-link")].map((a) => ({ href: a.getAttribute("href"), text: a.textContent.replace(/\\s+/g, " ").trim() })),
    anchorWarning: block.querySelector("a.prereq-link") === null && block.innerHTML.includes("href") ? "块里有链接文字但不是 a 元素" : null,
  };
})())`;

const probeFocus = `JSON.stringify((() => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return { onPrereq: false, ring: false, tag: "body", id: "" };
  const style = getComputedStyle(el);
  const ring = style.outlineStyle !== "none" && style.outlineWidth !== "0px";
  return {
    onPrereq: el.classList.contains("prereq-link"),
    ring,
    tag: el.tagName,
    id: String(el.id || ""),
    cls: String(el.className || ""),
  };
})())`;

const readBlockNow = async (cdp: Cdp) => JSON.parse(await cdp.evaluate<string>(readBlock)) as BlockProbe;
const focusNow = async (cdp: Cdp) => JSON.parse(await cdp.evaluate<string>(probeFocus)) as FocusState;

const pageUrl = (directory: string) => `${origin}/lessons/${directory}/index.html`;

function expectedText(courseId: string): string {
  const course = byId.get(courseId)!;
  const parts = ["先修"];

  for (const prerequisite of course.prerequisites) {
    const target = byId.get(prerequisite)!;
    parts.push(`${target.id} ${target.title}`, target.objectives[0]);
  }

  const index = order.indexOf(courseId);
  if (index > 0) {
    const previous = byId.get(order[index - 1])!;
    parts.push("上一课：", `${previous.id} ${previous.title}`);
  }

  return parts;
}

try {
  await ensureDevServer();
  await ensureChrome();
  const cdp = await Cdp.attach();

  // 先做一次「检查器本身有效」的自检：页面上临时插一条指向不存在课的死链，
  // 链接可达性检查必须当场指出它；随后断言页面已还原，避免把临时改动留在现场。
  section("检查器自检（临时插一条死链，必须被发现）");
  await cdp.navigate(pageUrl("s3-04"));
  const beforeInjection = (await readBlockNow(cdp)).links.length;
  await cdp.evaluate(`(() => {
    const link = document.createElement("a");
    link.id = "e2eTempDeadLink";
    link.className = "prereq-link";
    link.setAttribute("href", "../s9-99/index.html");
    link.textContent = "临时死链";
    document.querySelector("aside.prereq-note").appendChild(link);
    return true;
  })()`);

  // 与逐课检查用的是同一段判定：按 href 去开发服务器上取，非 200 就算不可达。
  const injectedBroken = JSON.parse(
    await cdp.evaluate<string>(`(async () => {
      const broken = [];
      for (const link of document.querySelectorAll("aside.prereq-note a.prereq-link")) {
        const url = new URL(link.getAttribute("href"), location.href);
        const response = await fetch(url).catch(() => null);
        if (!response || !response.ok) broken.push(link.getAttribute("href"));
      }
      return JSON.stringify(broken);
    })()`),
  ) as string[];

  check(
    "自检：临时插进来的死链会被链接可达性检查抓到",
    injectedBroken.length === 1 && injectedBroken[0] === "../s9-99/index.html",
    `判为不可达的链接：${JSON.stringify(injectedBroken)}`,
  );

  await cdp.evaluate('document.querySelector("#e2eTempDeadLink")?.remove() ?? true');
  const restored = await readBlockNow(cdp);
  check(
    "自检：临时改动已还原，页面回到仓库里的样子",
    restored.links.length === beforeInjection,
    `注入前 ${beforeInjection} 条、还原后 ${restored.links.length} 条`,
  );

  for (const directory of selectedLessons) {
    const courseId = order[allDirectories.indexOf(directory)];
    const course = byId.get(courseId)!;
    const previous = order.indexOf(courseId) > 0 ? byId.get(order[order.indexOf(courseId) - 1])! : null;

    section(`${course.id} ${course.title}（先修 ${course.prerequisites.join("、") || "无"}）`);
    await cdp.navigate(pageUrl(directory));
    const block = await readBlockNow(cdp);

    // 1) 一进页面、还没点任何按钮就能看见先修，而且还落在首屏之内（不用滚动）。
    check(
      "先修块不点任何按钮就完整落在首屏内",
      block.found && block.visible && block.inFirstScreen,
      block.found
        ? `viewport=${block.viewport} 块 ${block.top}→${block.bottom}px 文案="${block.text.slice(0, 40)}…"`
        : "页面里找不到 aside.prereq-note",
    );

    // 2) 文字与 courseData 派生一致（课号、课名、要会的那件事、上一课）。
    const expected = expectedText(courseId);
    const missing = expected.filter((fragment) => !block.text.includes(fragment));
    check("先修文案与 courseData 一致", missing.length === 0, missing.length === 0 ? `覆盖 ${expected.length} 段文案` : `缺：${missing.join(" / ")}`);

    // 3) 块里每条链接都能真的打开（不是死链），条数与先修 + 上一课对得上。
    const expectedLinkCount = course.prerequisites.length + (previous ? 1 : 0);
    const resolutions = await Promise.all(
      block.links.map(async (link) => {
        const url = new URL(link.href, pageUrl(directory));
        const response = await fetch(url);
        return `${link.text}->${response.status}`;
      }),
    );
    const brokenLinks = resolutions.filter((entry) => !entry.endsWith("->200"));
    check(
      "先修与上一课的链接都指向真实存在的课",
      block.links.length === expectedLinkCount && brokenLinks.length === 0 && block.anchorWarning === null,
      `链接 ${block.links.length}/${expectedLinkCount} 条，${brokenLinks.length === 0 ? "全部 200" : `打不开：${brokenLinks.join("、")}`}`,
    );

    // 4) 只用键盘也走得到，并且看得见焦点在哪。
    //    先修块排在页首，前面只有顶栏和组织内 FAQ 按钮，所以一路 Tab 过去必须撞上它。
    //    这一步接着用刚打开的那一页：第 1 至 3 项只读不碰焦点与滚动，此刻的页面状态
    //    正是学习者刚进来的样子（不再为了「干净」多刷新一次，少一次导航就少一次竞态）。
    let focused: FocusState = { onPrereq: false, ring: false, tag: "" };
    let tabsUsed = 0;

    for (let attempt = 0; attempt < maxTabsToPrereq; attempt += 1) {
      await cdp.tab();
      focused = await focusNow(cdp);
      tabsUsed += 1;
      // 撞上先修链接就算走到；先撞上「开始学习」说明先修块在 Tab 顺序里被跳过了。
      if (focused.onPrereq || focused.id === "beginButton") break;
    }

    if (expectedLinkCount > 0) {
      check(
        "Tab 走得到先修链接，且焦点环可见",
        focused.onPrereq && focused.ring,
        `${tabsUsed} 次 Tab 后落在 ${focused.tag}.${focused.cls ?? ""}，焦点环=${focused.ring}`,
      );
    } else {
      check(
        "第一课没有先修链接，键盘也不会撞上不存在的入口",
        !focused.onPrereq,
        `${tabsUsed} 次 Tab 内没有落到 .prereq-link`,
      );
    }

    // 5) 真实点一下：必须落到说的那一课，而不是只写着课号。
    if (expectedLinkCount > 0) {
      const targetId = course.prerequisites[0] ?? previous!.id;
      const target = byId.get(targetId)!;
      // 点之前先确认这条链接没有被别的元素盖住——盖住了就点不到，属于真实缺陷。
      // 无头浏览器视口只有 756x413，先像学习者那样把链接滚进视野再取坐标。
      const hit = JSON.parse(
        await cdp.evaluate<string>(`JSON.stringify((() => {
          const el = document.querySelector("aside.prereq-note a.prereq-link");
          el.scrollIntoView({ block: "center", inline: "center" });
          const rect = el.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const top = document.elementFromPoint(x, y);
          return {
            x: Math.round(x),
            y: Math.round(y),
            covered: !(top === el || el.contains(top)),
            topTag: top ? top.tagName : null,
            topDesc: top ? \`\${top.tagName}.\${String(top.className || "")}\` : null,
          };
        })())`),
      ) as { x: number; y: number; covered: boolean; topTag: string | null; topDesc: string | null };

      const box = await cdp.clickSelector("aside.prereq-note a.prereq-link");
      const landed = await cdp.waitForUrl((url) => url.includes(`/lessons/${targetId.toLowerCase()}/`));
      // 页面的 <title> 以「课号 ·」开头，用它确认真的落在了那一课（h1 是页面自己的标题，与目录名不同）。
      const landedTitle = landed ? await cdp.evaluate<string>("document.title") : "";
      const hrefNow = await cdp.evaluate<string>("location.pathname").catch(() => "<读不到>");
      check(
        "点第一条先修链接就进到那一课，地址与课号都对得上",
        landed !== null && landedTitle.startsWith(`${target.id} ·`) && !hit.covered,
        landed
          ? landedTitle
          : hit.covered
            ? `链接被 ${hit.topDesc} 盖住（点 ${box ? `${Math.round(box.x)},${Math.round(box.y)}` : `${hit.x},${hit.y}`}）`
            : `点击 ${hit.x},${hit.y} 后停在 ${hrefNow}，期望 ${targetId}`,
      );
    } else {
      // 第一课没有可点的先修入口：确认块里确实没有任何链接，不会把学习者带走。
      check("第一课的先修块里没有任何链接", block.links.length === 0, `链接 ${block.links.length} 条`);
    }
  }

  // 最后一节换成手机竖屏再走一遍全部课：先修块同样要在首屏内。
  // 这是移动端可读性的硬指标，也是这个功能最容易悄悄退化的一处（图例、段落一长就把它挤下去）。
  section("手机竖屏（390x844）下逐课确认先修块仍在首屏内");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  for (const directory of selectedLessons) {
    const courseId = order[allDirectories.indexOf(directory)];
    await cdp.navigate(pageUrl(directory));
    const block = await readBlockNow(cdp);
    check(
      `${courseId} 手机竖屏下先修块在首屏内`,
      block.found && block.visible && block.inFirstScreen,
      block.found ? `viewport=${block.viewport} 块 ${block.top}→${block.bottom}px` : "找不到先修块",
    );
  }

  await cdp.send("Emulation.clearDeviceMetricsOverride");

  cdp.close();
} finally {
  for (const browser of browsers) browser.kill();
  for (const server of servers) server.kill();
  for (const directory of tempDirs) rmSync(directory, { recursive: true, force: true });
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} 项通过`);

// 声明与实跑不符时先失败，避免文档里的项数悄悄过期。
const expectedTotal = selectedLessons.length * checksPerLesson + selfChecks;
if (checks.length !== expectedTotal) {
  console.error(
    `\n检查项数与声明不符：脚本声明每课 ${checksPerLesson} 项 + ${selfChecks} 项自检 = ${expectedTotal} 项，实际跑了 ${checks.length} 项。` +
      `\n请同步 checksPerLesson / selfChecks、tests/e2e/prereq-manual-checklist.md、docs/roadmap.md、docs/feature-checklist.md 与 README.md 里的数字。`,
  );
  process.exit(1);
}

if (failed.length > 0) {
  console.error("\n未通过：");
  for (const entry of failed) console.error(`- ${entry.name}  -> ${entry.detail}`);
  process.exit(1);
}

console.log("先修关系浏览器复验全部通过。");
