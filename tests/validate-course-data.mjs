import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const scriptMatch = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
const dataMatch = html.match(/const courseData = (\[[\s\S]*?\])\s*;\s*const state/);

assert.ok(scriptMatch, "无法从 index.html 找到交互脚本");
assert.doesNotThrow(() => new Function(scriptMatch[1]), "交互脚本必须能通过 JavaScript 语法解析");
assert.ok(dataMatch, "无法从 index.html 找到 courseData");

const courseData = vm.runInNewContext(`(${dataMatch[1]})`);
assert.equal(courseData.length, 40, "课程总数必须为 40 节");

const identifiers = new Set();
const perPhase = new Map();

for (const lesson of courseData) {
  assert.match(lesson.id, /^Y[1-5]-0[1-8]$/, `${lesson.id}: 课件 ID 格式错误`);
  assert.ok(!identifiers.has(lesson.id), `${lesson.id}: 课件 ID 重复`);
  identifiers.add(lesson.id);

  assert.ok(Number.isInteger(lesson.phase) && lesson.phase >= 0 && lesson.phase < 5, `${lesson.id}: phase 必须为 0-4`);
  assert.ok(typeof lesson.title === "string" && lesson.title.length > 0, `${lesson.id}: 缺少标题`);
  assert.ok(typeof lesson.duration === "string" && lesson.duration.length > 0, `${lesson.id}: 缺少时长`);
  assert.ok(typeof lesson.exercise === "string" && lesson.exercise.length > 0, `${lesson.id}: 缺少练习建议`);
  assert.ok(typeof lesson.video === "string" && lesson.video.length > 0, `${lesson.id}: 缺少视频组织建议`);

  for (const field of ["objectives", "contents", "checklist"]) {
    assert.ok(Array.isArray(lesson[field]) && lesson[field].length >= 3, `${lesson.id}: ${field} 至少需要三项`);
    assert.ok(lesson[field].every((item) => typeof item === "string" && item.trim().length > 0), `${lesson.id}: ${field} 不可包含空项`);
  }

  perPhase.set(lesson.phase, (perPhase.get(lesson.phase) ?? 0) + 1);
}

for (let phase = 0; phase < 5; phase += 1) {
  assert.equal(perPhase.get(phase), 8, `第 ${phase + 1} 年必须恰好包含 8 节课`);
}

console.log("课程数据结构通过：5 个阶段，40 节课，每节均含目标、内容与检验清单。");
