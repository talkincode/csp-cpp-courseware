import { expect, test } from "bun:test";
import { startDevServer, type DevServer } from "../scripts/dev";
import { NOT_FOUND_BODY, SITE_SOURCES, resolveSitePath } from "../src/site";
import { siteSources } from "../scripts/build";

// 开发服务器长期只做「把仓库目录当网站」这一件事：请求什么路径就拼出仓库里的同名文件，
// 所以 `/.git/config`、`/wrangler.jsonc`、`/AGENTS.md` 在本地都是 200，而线上这些地址
// 根本不存在（站点只发布 index.html、glossary/、lessons/ 三份内容）。
// 更糟的是默认监听地址是 0.0.0.0，同一局域网内的任何人都能这样把仓库连同 .git 读走。
// 这里把「本地看到的」和「线上发布的那一份」绑在一起，并守住只监听本机。

// 这些地址在线上必然 404（不在 dist/ 里），本地也不该例外。
const outsideSite = [
  "/.git/config",
  "/.git/HEAD",
  "/.gitignore",
  "/AGENTS.md",
  "/README.md",
  "/package.json",
  "/wrangler.jsonc",
  "/bun.lock",
  "/docs/roadmap.md",
  "/scripts/dev.ts",
  "/src/index.ts",
  "/tests/dev-server.test.ts",
  "/node_modules/.bin/bun",
  "/.env",
  "/.dev.vars",
];

async function withServer(run: (server: DevServer) => Promise<void>): Promise<void> {
  const server = startDevServer({ port: 0, host: "127.0.0.1" });

  try {
    await run(server);
  } finally {
    server.stop(true);
  }
}

// 不能借 `new URL(pathname, origin)` 拼地址：URL 解析器会把 `%2e%2e` 这类写法先行归一化，
// 于是「服务端有没有挡住编码后的越界路径」这件事根本没被测到。这里直接拼字符串，
// 让请求原样带上路径。
function assetUrl(pathname: string, origin: string): string {
  return `${origin}${pathname}`;
}

test("本地开发服务器只监听本机，不再把仓库暴露给整个局域网", async () => {
  await withServer(async (server) => {
    expect(server.hostname).toBe("127.0.0.1");
    expect(server.url.hostname).toBe("127.0.0.1");
  });
});

test("本地开发服务器只服务线上的那三份内容，仓库其余文件一律中文 404", async () => {
  await withServer(async (server) => {
    const origin = server.url.origin;
    const leaked: string[] = [];

    for (const pathname of outsideSite) {
      const response = await fetch(assetUrl(pathname, origin));

      if (response.status !== 404) leaked.push(`${pathname} -> ${response.status}`);
      else if ((await response.text()) !== NOT_FOUND_BODY) leaked.push(`${pathname} -> 非中文 404`);
    }

    expect(leaked).toEqual([]);
  });
});

test("本地开发服务器能打开站点自己的内容", async () => {
  await withServer(async (server) => {
    const origin = server.url.origin;
    const pages = ["/", "/index.html", "/lessons/s1-01/", "/lessons/s5-08/index.html"];

    for (const pathname of pages) {
      const response = await fetch(assetUrl(pathname, origin));

      expect(response.status).toBe(200);
      expect(await response.text()).toMatch(/<!doctype html>/i);
    }

    // 词条面板与词条表是课件里的硬依赖，本地 404 会让每一课都在报错。
    for (const pathname of ["/glossary/faq.json", "/glossary/faq-panel.js"]) {
      expect((await fetch(assetUrl(pathname, origin))).status).toBe(200);
    }

    // 首页与课程页是 UTF-8 中文，类型头错了浏览器就会显示乱码。
    const home = await fetch(assetUrl("/", origin));

    expect(home.headers.get("Content-Type")).toContain("text/html");
    expect(home.headers.get("Content-Type")).toContain("utf-8");
  });
});

test("课程地址少了末尾斜杠时，本地和线上一样跳到带斜杠的地址", async () => {
  await withServer(async (server) => {
    const origin = server.url.origin;
    const response = await fetch(assetUrl("/lessons/s1-01", origin), { redirect: "manual" });

    // 线上由静态资源的 html_handling: "auto-trailing-slash" 完成这一步（实测 307），
    // 本地以前直接 404——链接少一个斜杠就成了「本地打不开、线上能打开」。
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("/lessons/s1-01/");

    // 目录不存在时不能凭空跳转，否则缺课的地址会绕一圈再报 404。
    const missing = await fetch(assetUrl("/lessons/s9-99", origin), { redirect: "manual" });

    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe(NOT_FOUND_BODY);
  });
});

test("越界路径与仓库文件不会因为编码写法绕开内容边界", () => {
  const attacks = [
    "/.git/config",
    "/.git/config/",
    "/.gitignore",
    "/../package.json",
    "/lessons/../package.json",
    "/lessons/..%2F..%2Fpackage.json",
    "/lessons/s1-01/%2e%2e%2f%2e%2e%2fAGENTS.md",
    "/%2e%2e/%2e%2e/.git/config",
    "/glossary/%00/faq.json",
    "/lessons/%",
    "/lessons/%zz/",
    "/lessons/./s1-01/",
    "/lessons//s1-01/",
    "/scripts/dev.ts",
    "/src/index.ts",
    "/docs/roadmap.md",
    "/node_modules/bun/index.js",
    "lessons/s1-01/",
    "",
  ];
  const leaked = attacks.filter((pathname) => resolveSitePath(pathname).kind !== "outside");

  expect(leaked).toEqual([]);
});

test("内容边界认得出站点自己的地址，包括目录与文件两种形态", () => {
  const serve = (relativePath: string) => ({ kind: "serve", relativePath });

  expect(resolveSitePath("/")).toEqual(serve("index.html"));
  expect(resolveSitePath("/index.html")).toEqual(serve("index.html"));
  expect(resolveSitePath("/lessons/s1-01/")).toEqual(serve("lessons/s1-01/index.html"));
  expect(resolveSitePath("/lessons/s1-01/index.html")).toEqual(serve("lessons/s1-01/index.html"));
  expect(resolveSitePath("/glossary/faq.json")).toEqual(serve("glossary/faq.json"));
  expect(resolveSitePath("/glossary/faq-panel.js")).toEqual(serve("glossary/faq-panel.js"));

  // 目录地址少了末尾斜杠：交给调用方决定要不要跳转（目录不存在就 404）。
  expect(resolveSitePath("/lessons/s1-01")).toEqual({
    kind: "redirect",
    target: "/lessons/s1-01/",
  });
  expect(resolveSitePath("/glossary")).toEqual({ kind: "redirect", target: "/glossary/" });
});

test("站点内容边界只定义一次：开发服务器、构建与线上发布读的是同一份清单", () => {
  // 构建会把 siteSources 复制进 dist/，开发服务器从同一份清单判断「哪些请求算站点内容」。
  // 两边各写一份就会重新长出「本地能打开、线上 404」这类漂移，所以这里锁住是同一个数组。
  expect(siteSources).toBe(SITE_SOURCES);
  expect([...SITE_SOURCES]).toEqual(["index.html", "glossary", "lessons"]);
  expect(NOT_FOUND_BODY).toBe("页面未找到 (404 Not Found)");
});

test("开发服务器的端口与监听地址都要先校验，坏值当场说清而不是静默换端口", async () => {
  expect(() => startDevServer({ port: 0, host: "" })).toThrow(/HOST/);
  expect(() => startDevServer({ port: 70000, host: "127.0.0.1" })).toThrow(/PORT/);
  expect(() => startDevServer({ port: 1.5, host: "127.0.0.1" })).toThrow(/PORT/);

  // 端口被占用时要把「占用」说出来并给出换端口的方法，而不是换个端口假装启动成功。
  await withServer(async (server) => {
    expect(() => startDevServer({ port: server.port, host: "127.0.0.1" })).toThrow(/PORT/);
  });
});
