import { expect, test } from "bun:test";

const lessonPath = `${import.meta.dir}/../lessons/s5-03/index.html`;
const source = await Bun.file(lessonPath).text();

// S5-03 的「定位、改型、回归」改型卡用一个累加例子讲 int 回绕：手算总和是正数，程序却输出负数。
// 历史版本里这句话是错的——「累加 1 到 100000 再乘系数 100000」实测回绕成 +2087268864，
// 「n=100000，每项 10^5」实测回绕成 +1410065408，两个都是正数，孩子照着跑根本看不到负数。
// 讲义里的数字没人核算就没人发现，所以这里把例子绑到可机算的 int32 回绕事实：
// 改数字而不重新核算，`bun test` 当场失败。
const INT32_MAX = 2147483647n;
const UINT32_MAX = 4294967295n;
const UINT32_SPAN = 4294967296n;

// 32 位补码回绕：C++ 里 int 溢出是未定义行为，但常见竞赛环境实际表现就是这个回绕值。
function int32Wrap(total: bigint): number {
  const wrapped = ((total % UINT32_SPAN) + UINT32_SPAN) % UINT32_SPAN;
  return wrapped > INT32_MAX ? Number(wrapped - UINT32_SPAN) : Number(wrapped);
}

const scenarioPattern = /现象：n=(\d+)，每项 (\d+)，手算总和 (\d+)（正数），程序却输出 (-?\d+)/;
const match = source.match(scenarioPattern);

if (!match) {
  throw new Error(
    "lessons/s5-03/index.html 里找不到可机算的累加例子：" +
      "需要一行形如 `// 现象：n=<项数>，每项 <每项值>，手算总和 <总和>（正数），程序却输出 <结果>`，" +
      "且数字必须是实测核过的 int32 回绕值。",
  );
}

const [, rawCount, rawEach, rawTotal, rawOutput] = match;
const count = BigInt(rawCount);
const each = BigInt(rawEach);
const statedTotal = BigInt(rawTotal);
const statedOutput = Number(rawOutput);
const actualOutput = int32Wrap(statedTotal);
const magnitude = `${statedTotal / 100000000n} 亿`;

test("改型卡的累加例子算得出题面写的那个负数", () => {
  expect(actualOutput).toBe(statedOutput);
  expect(statedOutput).toBeLessThan(0);
});

test("例子里的手算总和就是项数乘以每项，不是随手写的数", () => {
  expect(count * each).toBe(statedTotal);
});

test("这个例子真的装不下 int，改成 long long 才不是空话", () => {
  expect(statedTotal).toBeGreaterThan(INT32_MAX);
  expect(source).toContain("long long sum = 0;");
});

// int 装不下但 unsigned int 装得下的话，检查器那句「unsigned int 还是装不下」就成了假话。
test("这个例子也装不下 unsigned int，指正才站得住", () => {
  expect(statedTotal).toBeGreaterThan(UINT32_MAX);
  expect(actualOutput).toBeLessThan(0);
});

test("讲义、三步卡与脚手架里每一处「现象」都说同一组数字", () => {
  const stepLead = (source.match(/<p class="step-lead">[\s\S]*?<\/p>/g) ?? []).find((block) =>
    block.includes("定位溢出点"),
  );
  expect(stepLead, "任务 2 讲这个例子的讲义段落还在").toBeDefined();
  expect(stepLead).toContain(String(statedTotal));
  expect(stepLead).toContain(String(statedOutput));

  const symptomLines = source.split("\n").filter((line) => line.includes("现象："));
  expect(symptomLines.length).toBeGreaterThanOrEqual(2);
  for (const line of symptomLines) {
    expect(line).toContain(String(statedTotal));
    expect(line).toContain(String(statedOutput));
  }
});

test("微练习、检查指正与提示都按同一量级说明，没有留下旧例子的说法", () => {
  for (const wording of ["装得下", "改型：让 sum 装得下"]) {
    expect(source).toContain(`${wording} ${magnitude}`);
  }
  for (const message of ["unsigned int 只是把上限抬高一点", "int 还是装不下", "回想“定位”那一步"]) {
    const line = source.split("\n").find((entry) => entry.includes(message));
    expect(line, `${message} 这一句还在`).toBeDefined();
    expect(line).toContain(magnitude);
  }

  // 旧例子的两个说法（10^10 量级、乘系数 100000）在这里必须彻底消失。
  expect(source).not.toContain("10^10");
  expect(source).not.toContain("乘系数");
});
