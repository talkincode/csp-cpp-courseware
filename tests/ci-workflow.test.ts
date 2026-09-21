import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// 站点曾经停在 4 节课，而仓库已经补到 40 节课：构建与部署只在某台机器上手工跑过一次，
// 之后没人重跑。现在 main 一合就由 GitHub Actions 发布，这条工作流本身也要被守住——
// 触发条件、测试先于发布、凭据、以及发布后对线上的抽检，缺一样都会让「自动发布」名不副实。
const projectRoot = `${import.meta.dir}/..`;
const workflowPath = ".github/workflows/test-and-deploy.yml";

type Step = { name?: string; uses?: string; run?: string; with?: Record<string, unknown> };
type Job = { needs?: string | string[]; if?: string; env?: Record<string, string>; steps: Step[] };
type Workflow = {
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs?: Record<string, Job>;
};

const workflow: Workflow = Bun.YAML.parse(readFileSync(resolve(projectRoot, workflowPath), "utf8"));
const jobs = workflow.jobs ?? {};
const deploy = jobs.deploy;
const testJob = jobs.test;

function runScripts(job: Job | undefined): string {
  return (job?.steps ?? []).map((step) => step.run ?? "").join("\n");
}

test("工作流在 main 推送、PR 与手动触发下运行", () => {
  expect(existsSync(resolve(projectRoot, workflowPath))).toBe(true);
  expect(Object.keys(workflow.on ?? {}).sort()).toEqual(["pull_request", "push", "workflow_dispatch"]);
  expect((workflow.on?.push as { branches?: string[] })?.branches).toEqual(["main"]);
  // 只读权限：发布不需要写仓库内容
  expect(workflow.permissions?.contents).toBe("read");
});

test("发布前必须先跑 bun test，且发布只在 main 上发生", () => {
  expect(runScripts(testJob)).toContain("bun test");
  expect(deploy?.needs).toBe("test");

  const condition = deploy?.if ?? "";
  expect(condition).toContain("refs/heads/main");
  // PR 上不给 secrets，也不能发布
  expect(condition).toContain("github.event_name == 'push'");
});

test("发布走 bun run deploy，不允许绕过构建直接推 dist", () => {
  const scripts = runScripts(deploy);

  expect(scripts).toContain("bun run deploy");
  // 直接 wrangler deploy 会跳过 build，把上一次的旧产物发出去——正是要防的事故
  expect(scripts).not.toContain("wrangler deploy");
  expect(scripts).not.toContain("dist");
});

test("凭据只从仓库 secret 取，缺凭据时明确失败而不是静默跳过", () => {
  const env = deploy?.env ?? {};
  const scripts = runScripts(deploy);

  expect(env.CLOUDFLARE_API_TOKEN).toBe("${{ secrets.CLOUDFLARE_API_TOKEN }}");
  // 账号 ID 不是凭据，随工作流一起写在仓库里
  expect(env.CLOUDFLARE_ACCOUNT_ID).toMatch(/^[0-9a-f]{32}$/);
  expect(scripts).toContain('if [ -z "${CLOUDFLARE_API_TOKEN}" ]');
  expect(scripts).toContain("::error::");
});

test("发布后抽检线上：每一节课、末尾斜杠跳转、词条面板与中文 404", () => {
  const scripts = runScripts(deploy);

  // 抽检的课来自仓库自己的 lessons 目录，新课自动纳入
  expect(scripts).toContain("for dir in lessons/*/");
  expect(scripts).toContain("glossary/faq-panel.js");
  expect(scripts).toContain("页面未找到");
  // 发布刚生效时可能有传播延迟，失败要重试而不是立刻判死
  expect(scripts).toContain("attempt");
  // 抽检的域名必须与 wrangler.jsonc 里的部署目标一致
  const config = JSON.parse(readFileSync(resolve(projectRoot, "wrangler.jsonc"), "utf8"));
  expect(scripts).toContain(config.routes[0].pattern);
});

test("文档写清了自动发布与它需要的 secret", () => {
  const readme = readFileSync(resolve(projectRoot, "README.md"), "utf8");

  expect(readme).toContain("CLOUDFLARE_API_TOKEN");
  expect(readme).toContain(workflowPath);
  expect(readme).toContain("cplus.talkincode.net");
});
