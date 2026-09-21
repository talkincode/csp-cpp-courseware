import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { SITE_SOURCES } from "../src/site";

const projectRoot = resolve(import.meta.dir, "..");

// 线上站点是纯静态资源：内容只来自仓库里的 index.html、glossary/ 与 lessons/。
// 这里曾经出过事——仓库已经补到 40 节课，cplus.talkincode.net 还停在 4 节课，
// 因为构建与部署只在某台机器上手工跑过一次。产物一律从仓库内容生成，
// 不允许手工拼装 dist/，否则「仓库有这节课、站点上还是 404」的漂移会再出现一次。
//
// 清单本身放在 src/site.ts：本地开发服务器与线上 Worker 读的是同一条边界，
// 各写一份就会重新长出「本地能打开、线上 404」这类不一致。
export const siteSources = SITE_SOURCES;

export async function buildStaticSite({
  root = projectRoot,
  distDir = resolve(root, "dist"),
}: { root?: string; distDir?: string } = {}): Promise<string> {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  for (const source of siteSources) {
    await cp(resolve(root, source), resolve(distDir, source), { recursive: true });
  }

  return distDir;
}

// 产物里到底有几节课，是「这次构建有没有漏课」最直接的信号，
// 所以构建脚本自己数一遍并打印出来。
export async function lessonPageCount(distDir: string): Promise<number> {
  const entries = await readdir(resolve(distDir, "lessons"), { withFileTypes: true });
  let pages = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const page = Bun.file(resolve(distDir, "lessons", entry.name, "index.html"));
    if (await page.exists()) pages += 1;
  }

  return pages;
}

if (import.meta.main) {
  const distDir = await buildStaticSite();

  console.log(
    JSON.stringify(
      {
        status: "ok",
        dist: distDir,
        lessonPages: await lessonPageCount(distDir),
        sources: siteSources,
      },
      null,
      2,
    ),
  );
}
