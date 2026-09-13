const projectRoot = `${import.meta.dir}/..`;
const portValue = Bun.env.PORT ?? "4173";
const port = Number(portValue);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PORT must be an integer between 1 and 65535; received ${portValue}.`);
}

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function requestedFile(pathname: string): string | null {
  let decoded: string;

  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const normalizedPath = decoded.endsWith("/") ? `${decoded}index.html` : decoded;
  const segments = normalizedPath.split("/");

  if (!normalizedPath.startsWith("/") || segments.includes("..") || segments.includes("\0")) {
    return null;
  }

  return `${projectRoot}${normalizedPath}`;
}

function contentType(path: string): string {
  const extension = path.slice(path.lastIndexOf("."));
  return mimeTypes[extension] ?? "application/octet-stream";
}

const server = Bun.serve({
  port,
  async fetch(request) {
    const path = requestedFile(new URL(request.url).pathname);

    if (!path) {
      return new Response("Invalid path.", { status: 400 });
    }

    const file = Bun.file(path);
    if (!(await file.exists())) {
      return new Response("Not found.", { status: 404 });
    }

    return new Response(file, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": contentType(path),
      },
    });
  },
});

console.log(`CSP C++ courseware is running at ${server.url}`);
