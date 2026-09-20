import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// 历史轮次反复漏改过 roadmap 里「尚未迁移的 N 节课」这类数字：现场清单已经减少，
// 正文却还写着旧数量，读文档的人会拿到过期事实。这里把两处绑定起来。
const projectRoot = `${import.meta.dir}/..`;

function pendingTypedPracticeCount(): number {
  const source = readFileSync(`${projectRoot}/tests/typed-practice-contract.test.ts`, "utf8");
  const match = source.match(/const pendingTypedPractice\s*=\s*\[([^\]]*)\]/);
  if (!match) throw new Error("typed-practice-contract.test.ts 里找不到 pendingTypedPractice 清单");
  const ids = match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return ids.length;
}

function claimedPendingCounts(document: string): number[] {
  const source = readFileSync(`${projectRoot}/${document}`, "utf8");
  const claims: number[] = [];
  // 只检查明确写了数量的句子；换成别的措辞就不拦，避免把文档改写当成失败。
  const pattern = /尚未迁移的\s*(\d+)\s*节课/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    claims.push(Number(match[1]));
  }

  return claims;
}

test("roadmap 写的「尚未迁移的 N 节课」与现场待迁移清单一致", () => {
  const actual = pendingTypedPracticeCount();
  const claims = claimedPendingCounts("docs/roadmap.md");

  for (const claim of claims) {
    expect(claim).toBe(actual);
  }
});
