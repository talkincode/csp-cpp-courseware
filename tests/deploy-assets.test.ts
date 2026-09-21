import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildStaticSite, lessonPageCount, siteSources } from "../scripts/build";
import { lessonDirectoryName, loadCurriculum } from "../scripts/curriculum";
import worker from "../src/index";

// 线上站点（cplus.talkincode.net）曾经停在 4 节课：仓库已经补到 40 节课，
// 部署产物却还是某台机器上很久以前手工构建的那一份。构建与发布链路现在进了仓库，
// 这里守住两件最容易再次漂移的事——产物必须覆盖 courseData 里的每一节课，
// 且 Worker 的跳转与中文 404 不能静默消失。
const projectRoot = `${import.meta.dir}/..`;

async function buildInto(): Promise<{ distDir: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(resolve(tmpdir(), "csp-courseware-build-"));
  const distDir = await buildStaticSite({ root: projectRoot, distDir: resolve(root, "dist") });

  return { distDir, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test("构建产物覆盖 courseData 里的每一节课", async () => {
  const curriculum = await loadCurriculum();
  const { distDir, cleanup } = await buildInto();

  try {
    const missing: string[] = [];

    for (const course of curriculum) {
      const directory = resolve(distDir, "lessons", lessonDirectoryName(course.id));

      for (const file of ["index.html", "lesson.json"]) {
        if (!existsSync(resolve(directory, file))) missing.push(`${course.id}/${file}`);
      }
    }

    expect(missing).toEqual([]);
    expect(await lessonPageCount(distDir)).toBe(curriculum.length);

    // 课程目录页与词条面板也必须是线上真实存在的一份，
    // 否则课件里的 /glossary/faq-panel.js 会 404。
    for (const asset of ["index.html", "glossary/faq.json", "glossary/faq-panel.js"]) {
      expect(existsSync(resolve(distDir, asset))).toBe(true);
    }

    expect(siteSources).toEqual(["index.html", "glossary", "lessons"]);
  } finally {
    await cleanup();
  }
});

test("每次构建都会重建 dist，上一次留下的旧页面不会跟着上线", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "csp-courseware-stale-"));
  const distDir = resolve(root, "dist");

  try {
    await buildStaticSite({ root: projectRoot, distDir });
    await Bun.write(resolve(distDir, "lessons", "s9-99", "index.html"), "<html>过期页面</html>");

    await buildStaticSite({ root: projectRoot, distDir });

    expect(existsSync(resolve(distDir, "lessons", "s9-99"))).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function assetEnv(options: { missing?: string } = {}) {
  return {
    ASSETS: {
      async fetch(request: Request) {
        const pathname = new URL(request.url).pathname;

        if (pathname === options.missing) return new Response("not found", { status: 404 });

        return new Response(`asset:${pathname}`, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    },
  };
}

function visit(pathname: string, options: { missing?: string } = {}) {
  const request = new Request(`https://cplus.talkincode.net${pathname}`);

  return worker.fetch(request, assetEnv(options) as never);
}

// 课程地址的末尾斜杠跳转由静态资源层（html_handling: "auto-trailing-slash"）完成，
// 请求到不了 Worker：线上实测 /lessons/s1-01 返回 307 而不是 Worker 里的 301。
// 所以 Worker 里不再留第二份跳转——缺课的地址直接得到中文 404，而不是先绕一次跳转。
test("Worker 不再自己跳转课程地址：缺课的地址直接给出中文 404", async () => {
  const response = await visit("/lessons/s9-99", { missing: "/lessons/s9-99" });

  expect(response.status).toBe(404);
  expect(await response.text()).toBe("页面未找到 (404 Not Found)");
});

test("带斜杠的课程地址与词条面板直接交给静态资源", async () => {
  const lesson = await visit("/lessons/s1-01/");
  const glossary = await visit("/glossary/faq.json");

  expect(lesson.status).toBe(200);
  expect(await lesson.text()).toBe("asset:/lessons/s1-01/");
  expect(glossary.status).toBe(200);
  expect(await glossary.text()).toBe("asset:/glossary/faq.json");
});

test("找不到的地址给出中文 404，而不是托管商的英文默认页", async () => {
  const response = await visit("/lessons/s5-08/", { missing: "/lessons/s5-08/" });

  expect(response.status).toBe(404);
  expect(await response.text()).toBe("页面未找到 (404 Not Found)");
  expect(response.headers.get("Content-Type")).toContain("utf-8");
});

test("部署目标写死在仓库里：Worker 名、dist 目录与自定义域名都对得上", async () => {
  const config = JSON.parse(await Bun.file(resolve(projectRoot, "wrangler.jsonc")).text());
  const manifest = JSON.parse(await Bun.file(resolve(projectRoot, "package.json")).text());
  const readme = await Bun.file(resolve(projectRoot, "README.md")).text();

  expect(config.name).toBe("csp-cpp-courseware");
  expect(config.main).toBe("src/index.ts");
  expect(existsSync(resolve(projectRoot, config.main))).toBe(true);

  // 发布目录必须就是构建脚本写出的那一个。
  expect(config.assets.directory).toBe("./dist");
  expect(config.assets.binding).toBe("ASSETS");

  // 课程地址的末尾斜杠跳转靠的就是这一行：静态资源层先于 Worker 处理请求，
  // 删掉它 /lessons/s1-01 这类地址就会直接 404，页面里的相对链接也会跟着错位。
  expect(config.assets.html_handling).toBe("auto-trailing-slash");
  expect(config.assets.not_found_handling).toBe("none");
  expect(config.routes).toEqual([{ pattern: "cplus.talkincode.net", custom_domain: true }]);

  // 域名只该在文档里以同一副面孔出现，改一处漏一处会当场失败。
  expect(readme).toContain("cplus.talkincode.net");

  // 部署必须先重新构建，否则又会把上一次的旧产物发出去。
  expect(manifest.scripts.deploy).toContain("bun run build");
  expect(manifest.scripts.build).toBe("bun scripts/build.ts");
});
