export interface Env {
  ASSETS: Fetcher;
}

// 站点是纯静态资源：课程页、课程目录页和词条面板都由静态资源层直接托管。
// Worker 只负责一件事——把 404 换成中文说明，而不是把托管商的英文默认页丢给零基础学习者。
// 课程地址的末尾斜杠跳转（/lessons/s1-01 → /lessons/s1-01/）由 wrangler.jsonc 的
// html_handling: "auto-trailing-slash" 在静态资源层完成，请求根本到不了这里；
// 之前这里另写了一段跳转，线上从来没有生效过，只把缺课的地址多绕了一次 301。
const notFoundBody = "页面未找到 (404 Not Found)";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.ASSETS.fetch(request);

    if (response.status === 404) {
      return new Response(notFoundBody, {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return response;
  },
};
