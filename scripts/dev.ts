import { statSync } from "node:fs";
import { resolve } from "node:path";
import { NOT_FOUND_BODY, resolveSitePath } from "../src/site";

const projectRoot = resolve(import.meta.dir, "..");

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

export type DevServer = ReturnType<typeof Bun.serve>;

export type DevServerOptions = {
  port: number;
  host: string;
};

// 默认只监听本机回环地址。以前用的是 Bun.serve 的默认值 —— 所有网卡，
// 于是同一局域网内的任何人都能把仓库连同 .git 读走。
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4173;

const notFoundHeaders = { "Content-Type": "text/plain; charset=utf-8" };

function parsePort(raw: string): number {
  const port = Number(raw);

  // 0 表示「让操作系统挑一个空闲端口」，只有测试会用到。
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT 必须是 0 到 65535 之间的整数，当前是 ${raw}。`);
  }

  return port;
}

function parseHost(raw: string): string {
  if (raw.trim().length === 0) {
    throw new Error("HOST 不能为空；只想在本机打开就写 127.0.0.1（默认值）。");
  }

  return raw.trim();
}

function contentType(path: string): string {
  const extension = path.slice(path.lastIndexOf("."));
  return mimeTypes[extension] ?? "application/octet-stream";
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function startDevServer(options: DevServerOptions): DevServer {
  const port = parsePort(String(options.port));
  const host = parseHost(String(options.host));

  try {
    return Bun.serve({
      port,
      hostname: host,
      async fetch(request) {
        const url = new URL(request.url);
        const target = resolveSitePath(url.pathname);

        // 站点之外的一切都按「没有这个地址」处理：线上只发布 index.html、
        // glossary/、lessons/，仓库里的 .git、脚本和文档在那份产物里并不存在。
        // 文案与状态码都跟线上 Worker 保持一致。
        if (target.kind === "outside") {
          return new Response(NOT_FOUND_BODY, { status: 404, headers: notFoundHeaders });
        }

        // 少了末尾斜杠的目录地址：线上静态资源会 307 到带斜杠的地址
        // （wrangler.jsonc 的 html_handling: "auto-trailing-slash"），本地跟上同一步，
        // 否则「本地打不开、线上能打开」会反过来长出来。目录不存在时不跳转，直接 404。
        if (target.kind === "redirect") {
          if (!isDirectory(resolve(projectRoot, target.target.slice(1, -1)))) {
            return new Response(NOT_FOUND_BODY, { status: 404, headers: notFoundHeaders });
          }

          return new Response(null, {
            status: 307,
            headers: { Location: `${target.target}${url.search}` },
          });
        }

        const path = resolve(projectRoot, target.relativePath);
        const file = Bun.file(path);

        if (!(await file.exists())) {
          return new Response(NOT_FOUND_BODY, { status: 404, headers: notFoundHeaders });
        }

        return new Response(file, {
          headers: {
            "Cache-Control": "no-store",
            "Content-Type": contentType(path),
          },
        });
      },
    });
  } catch (error) {
    // Bun 在端口占用时抛的是英文的 "Is port X in use?"，直接丢给使用者既不好读
    // 也没说怎么办，所以这里换成中文并给出换端口的写法。
    const detail = error instanceof Error ? error.message : String(error);

    throw new Error(
      `PORT ${host}:${port} 无法监听：端口可能已被占用。换一个再试，例如 PORT=4199 bun run dev。（${detail}）`,
    );
  }
}

if (import.meta.main) {
  const server = startDevServer({
    port: parsePort(Bun.env.PORT ?? String(DEFAULT_PORT)),
    host: parseHost(Bun.env.HOST ?? DEFAULT_HOST),
  });

  console.log(`CSP C++ courseware is running at ${server.url}`);
}
