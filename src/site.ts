// 站点内容边界只在这里定义一次：构建（scripts/build.ts）、本地开发服务器
// （scripts/dev.ts）和线上 Worker（src/index.ts）都读这一份。
//
// 以前这条边界有两个版本：构建只把 index.html、glossary/、lessons/ 复制进 dist/，
// 开发服务器却把整个仓库目录当网站，请求什么路径就拼出同名文件。于是
// `/.git/config`、`/wrangler.jsonc`、`/AGENTS.md` 在本地都是 200、线上都是 404，
// 同一个地址在两处表现不一致；本地服务又默认监听所有网卡，局域网里的其他人
// 也能这样把仓库连同 .git 读走。
export const SITE_SOURCES = ["index.html", "glossary", "lessons"] as const;

export const SITE_ENTRY = "index.html";

// 线上 Worker 与本地开发服务器对「没有这个地址」必须说同一句话：零基础学习者
// 不该在一个环境看到中文说明、在另一个环境看到托管商的英文默认页。
export const NOT_FOUND_BODY = "页面未找到 (404 Not Found)";

export type SitePath =
  | { kind: "serve"; relativePath: string }
  | { kind: "redirect"; target: string }
  | { kind: "outside" };

const outside: SitePath = { kind: "outside" };

// 目录名在这里一律是 `s<阶段>-<序号>` 这种不含点的写法；把「最后一段带不带扩展名」
// 当作「文件还是目录」的判据，和静态服务器的常规做法一致。真遇到带点的目录名，
// 结果只是本地 404、线上 307，不会读到站点之外的内容。
function looksLikeFile(segment: string): boolean {
  return segment.lastIndexOf(".") > 0;
}

export function resolveSitePath(pathname: string): SitePath {
  let decoded: string;

  // 百分号编码坏掉（例如 `/lessons/%`）时不要让异常冒到调用方。
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return outside;
  }

  if (!decoded.startsWith("/") || decoded.includes("\0")) return outside;
  if (decoded === "/") return { kind: "serve", relativePath: SITE_ENTRY };

  // 末尾斜杠表示「要的是这个目录」，去掉后再切分；`//` 会产生空段，随后被挡下。
  const trailingSlash = decoded.endsWith("/");
  const body = trailingSlash ? decoded.slice(1, -1) : decoded.slice(1);
  const segments = body.split("/");

  for (const segment of segments) {
    // `.`、`..` 与任何点开头的段（`.git`、`.env`、`.dev.vars`）都不是站点内容。
    if (segment.length === 0 || segment.startsWith(".")) return outside;
  }

  const [first, ...rest] = segments;

  if (first === SITE_ENTRY) {
    // 只有 `/index.html` 本身是站点内容，`/index.html/...` 这种拼法不存在。
    return rest.length === 0 && !trailingSlash
      ? { kind: "serve", relativePath: SITE_ENTRY }
      : outside;
  }

  if (!SITE_SOURCES.includes(first as (typeof SITE_SOURCES)[number])) return outside;

  if (rest.length === 0) {
    return trailingSlash
      ? { kind: "serve", relativePath: `${first}/${SITE_ENTRY}` }
      : { kind: "redirect", target: `/${first}/` };
  }

  const relativePath = segments.join("/");

  // 目录地址：服务目录下的 index.html；目录不存在时由调用方给出 404。
  if (trailingSlash) return { kind: "serve", relativePath: `${relativePath}/${SITE_ENTRY}` };

  // 少了末尾斜杠的目录地址：只有目录真的存在才该跳转，这件事由调用方确认。
  return looksLikeFile(segments[segments.length - 1])
    ? { kind: "serve", relativePath }
    : { kind: "redirect", target: `/${relativePath}/` };
}
