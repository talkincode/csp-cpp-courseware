import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadCurriculum } from "../scripts/curriculum";

const projectRoot = `${import.meta.dir}/..`;
const roadmapPath = `${projectRoot}/docs/roadmap.md`;

// `docs/roadmap.md` 是本项目的项目画像，「验收矩阵」一节既要覆盖到每一节课，
// 也要让证据列指得着真实存在的用例。这两件事都曾经漏过：课补完了没补行、
// 题库校验早就有了却还写着「❌ 缺口 / 待新增题库校验」，读文档的人只能拿到过期事实。
// 这里把矩阵和现场的课程、用例文件绑起来，改漏任何一处都会失败。
function matrixRows(): string[] {
  const section = readFileSync(roadmapPath, "utf8").split("## 验收矩阵")[1];

  if (!section) throw new Error("docs/roadmap.md 里找不到「验收矩阵」一节");

  return section
    .split("\n")
    .filter((line) => line.startsWith("| "))
    .map((line) => line.trimEnd());
}

function evidencePaths(row: string): string[] {
  return [...row.matchAll(/\]\((\.\.\/[^)#]+)/g)].map((match) => match[1]);
}

test("验收矩阵为每节课都留着互动界面与随机在线测试两行", async () => {
  const curriculum = await loadCurriculum();
  const rows = matrixRows();
  const problems: string[] = [];

  expect(curriculum.length).toBeGreaterThan(0);

  for (const course of curriculum) {
    // 课从「规划」变成「可在线学习」时互动界面与测试必须一起到位，矩阵也要同时能查到这两行。
    for (const label of ["引导式在线学习界面", "随机在线测试"]) {
      const row = rows.find((line) => line.startsWith(`| ${course.id} ${label} `));

      if (!row) problems.push(`${course.id}: 验收矩阵里没有「${label}」这一行`);
    }
  }

  expect(problems).toEqual([]);
});

test("验收矩阵里的证据链接都指得着真实文件", () => {
  const problems: string[] = [];

  for (const row of matrixRows()) {
    const feature = row.split("|")[1]?.trim() ?? "<未命名>";

    for (const path of evidencePaths(row)) {
      // 证据列写着用例文件名，就不该出现「文件已改名/已删除但矩阵没跟着改」。
      if (!existsSync(resolve(projectRoot, "docs", path))) problems.push(`${feature}: 证据 ${path} 不存在`);
    }
  }

  expect(problems).toEqual([]);
});

test("题库与答案解析维护一行必须指着真正在跑的校验，不再标成缺口", () => {
  const row = matrixRows().find((line) => line.startsWith("| 题库与答案解析维护 "));

  expect(row).toBeDefined();

  // 题库元数据由 lesson-contract 逐题校验，抽出来的试卷由 quiz-paper-contract 校验；
  // 只要还有人跑这两条用例，这一行就不能退回「❌ 缺口 / 待新增题库校验」。
  expect(row).toContain("tests/lesson-contract.test.ts");
  expect(row).toContain("tests/quiz-paper-contract.test.ts");
  expect(row).not.toContain("❌");
  expect(row).not.toContain("待新增");
});
