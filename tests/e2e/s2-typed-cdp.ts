#!/usr/bin/env bun
/**
 * 手写填空微编程的浏览器自动化复验（零依赖）。
 *
 * 用法：bun run e2e:s2-typed（S2 八课）、bun run e2e:s3-typed（S3 八课）、bun run e2e:s4-typed（S4 八课）、bun run e2e:s5-typed（S5 已迁移的五课）、bun run e2e:typed（全部）
 *
 * 这个脚本最早为 S2 八课而写，后来 S3、S4 与 S5 的课沿用同一套课件样板，所以也一起跑；
 * 用 CSP_E2E_LESSONS=s3-01,s3-03 可以只跑指定几课。
 *
 * 脚本会自行启动开发服务器与无头 Chrome，验证「只读脚手架 + 一空」的
 * 微编程练习：出现时机、真实键盘输入、错误指正、兜底按钮、草稿恢复与提交后解锁。
 * 它不在 `bun test` 范围内：需要真实浏览器，属于体验验收，不是单元测试。
 *
 * 可用环境变量覆盖默认值：
 *   CSP_E2E_PORT      开发服务器端口（默认 4273）
 *   CSP_E2E_CDP_PORT  无头 Chrome 的调试端口（默认 9343）
 *   CSP_E2E_CHROME    Chrome 可执行文件路径
 *   CSP_E2E_ORIGIN    复用已在运行的服务地址（设置后不自行启动服务器）
 *   CSP_E2E_LESSONS   只跑指定课程，逗号分隔（如 s3-01,s3-02）
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const projectRoot = `${import.meta.dir}/../..`;
const port = Number(Bun.env.CSP_E2E_PORT ?? 4273);
const cdpPort = Number(Bun.env.CSP_E2E_CDP_PORT ?? 9343);
const origin = Bun.env.CSP_E2E_ORIGIN ?? `http://localhost:${port}`;
const chromeCandidates = [
  Bun.env.CSP_E2E_CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter((value): value is string => typeof value === "string" && value.length > 0);

type LessonConfig = {
  directory: string;
  storageKey: string;
  micro: string;
  input: string;
  check: string;
  hint: string;
  ref: string;
  reset: string;
  hintPanel: string;
  refPanel: string;
  typedField: string;
  draftField: string;
  good: string;
  fullWidth: string;
  fullWidthHint: string;
  outOfBounds: string;
  outOfBoundsMessage: string;
  blankWant: string;
  // 任务 1 里要点对的两处选择；多数课沿用同一套标记，个别课的行名不同，需要逐课声明。
  taskOnePicks?: string[];
  scenario: string;
};

// 已迁移的二十九课各自的一空答案与应当出现的指正；fullWidth / outOfBounds 用来验证失败路径。
const lessons: LessonConfig[] = [
  {
    directory: "s2-01",
    storageKey: "csp-cpp-s2-01-progress-v1",
    micro: "lastIndexMicro",
    input: "lastIndexInput",
    check: "lastIndexCheckButton",
    hint: "lastIndexHintButton",
    ref: "lastIndexRefButton",
    reset: "lastIndexResetButton",
    hintPanel: "lastIndexHint",
    refPanel: "lastIndexRef",
    typedField: "lastIndexTyped",
    draftField: "lastIndexDraft",
    good: "a[n - 1]",
    fullWidth: "a［n - 1］",
    fullWidthHint: "半角",
    outOfBounds: "a[n]",
    outOfBoundsMessage: "越界",
    blankWant: "a[ 下标 ]",
    scenario: "访问最后一个成绩",
  },
  {
    directory: "s2-02",
    storageKey: "csp-cpp-s2-02-progress-v1",
    micro: "lastCharMicro",
    input: "lastCharInput",
    check: "lastCharCheckButton",
    hint: "lastCharHintButton",
    ref: "lastCharRefButton",
    reset: "lastCharResetButton",
    hintPanel: "lastCharHint",
    refPanel: "lastCharRef",
    typedField: "lastCharTyped",
    draftField: "lastCharDraft",
    good: "s[n - 1]",
    fullWidth: "s［n - 1］",
    fullWidthHint: "半角",
    outOfBounds: "s[n]",
    outOfBoundsMessage: "越界",
    blankWant: "s[ 下标 ]",
    scenario: "访问最后一个字符",
  },
  {
    directory: "s2-03",
    storageKey: "csp-cpp-s2-03-progress-v1",
    micro: "callMicro",
    input: "callInput",
    check: "callCheckButton",
    hint: "callHintButton",
    ref: "callRefButton",
    reset: "callResetButton",
    hintPanel: "callHint",
    refPanel: "callRef",
    typedField: "callTyped",
    draftField: "callDraft",
    good: "isEven(4)",
    fullWidth: "isEven（4）",
    fullWidthHint: "半角",
    outOfBounds: "isEven",
    outOfBoundsMessage: "括号",
    blankWant: "isEven(",
    scenario: "写出这次调用",
  },
  {
    directory: "s2-04",
    storageKey: "csp-cpp-s2-04-progress-v1",
    micro: "passParamMicro",
    input: "passParamInput",
    check: "passParamCheckButton",
    hint: "passParamHintButton",
    ref: "passParamRefButton",
    reset: "passParamResetButton",
    hintPanel: "passParamHint",
    refPanel: "passParamRef",
    typedField: "passParamTyped",
    draftField: "passParamDraft",
    good: "int x",
    fullWidth: "int x；",
    fullWidthHint: "半角",
    outOfBounds: "int &x",
    outOfBoundsMessage: "引用",
    blankWant: "int x",
    scenario: "写出值传递的形参",
  },
  {
    directory: "s2-05",
    storageKey: "csp-cpp-s2-05-progress-v1",
    micro: "memberMicro",
    input: "memberInput",
    check: "memberCheckButton",
    hint: "memberHintButton",
    ref: "memberRefButton",
    reset: "memberResetButton",
    hintPanel: "memberHint",
    refPanel: "memberRef",
    typedField: "memberTyped",
    draftField: "memberDraft",
    good: "a[0].score",
    fullWidth: "a[0]．score",
    fullWidthHint: "半角",
    outOfBounds: "a[0].name",
    outOfBoundsMessage: "score",
    blankWant: "a[0]",
    scenario: "写出读分数的成员访问",
  },
  {
    directory: "s2-06",
    storageKey: "csp-cpp-s2-06-progress-v1",
    micro: "swapMicro",
    input: "swapInput",
    check: "swapCheckButton",
    hint: "swapHintButton",
    ref: "swapRefButton",
    reset: "swapResetButton",
    hintPanel: "swapHint",
    refPanel: "swapRef",
    typedField: "swapTyped",
    draftField: "swapDraft",
    good: "swap(a[0], a[1])",
    fullWidth: "swap（a[0], a[1]）",
    fullWidthHint: "半角",
    outOfBounds: "swap(a[0], a[2])",
    outOfBoundsMessage: "相邻",
    blankWant: "swap(",
    scenario: "写出相邻交换",
  },
  {
    directory: "s2-07",
    storageKey: "csp-cpp-s2-07-progress-v1",
    micro: "enumMicro",
    input: "enumInput",
    check: "enumCheckButton",
    hint: "enumHintButton",
    ref: "enumRefButton",
    reset: "enumResetButton",
    hintPanel: "enumHint",
    refPanel: "enumRef",
    typedField: "enumTyped",
    draftField: "enumDraft",
    good: "if (i % 2 == 0) evenCount++;",
    fullWidth: "if（i ％ 2 == 0）evenCount＋＋；",
    fullWidthHint: "半角",
    outOfBounds: "evenCount++;",
    outOfBoundsMessage: "漏分支",
    blankWant: "if (",
    scenario: "写出遇到偶数时的判断与更新",
  },
  {
    directory: "s2-08",
    storageKey: "csp-cpp-s2-08-progress-v1",
    micro: "opsMicro",
    input: "opsInput",
    check: "opsCheckButton",
    hint: "opsHintButton",
    ref: "opsRefButton",
    reset: "opsResetButton",
    hintPanel: "opsHint",
    refPanel: "opsRef",
    typedField: "opsTyped",
    draftField: "opsDraft",
    good: "n * n",
    fullWidth: "n ＊ n",
    fullWidthHint: "半角",
    outOfBounds: "n + n",
    outOfBoundsMessage: "相乘",
    blankWant: "n *",
    scenario: "写出双层循环的次数算式",
  },
  {
    directory: "s3-01",
    storageKey: "csp-cpp-s3-01-progress-v1",
    micro: "digitMicro",
    input: "digitInput",
    check: "digitCheckButton",
    hint: "digitHintButton",
    ref: "digitRefButton",
    reset: "digitResetButton",
    hintPanel: "digitHint",
    refPanel: "digitRef",
    typedField: "digitTyped",
    draftField: "digitDraft",
    good: "x % 10",
    fullWidth: "x ％ 10",
    fullWidthHint: "半角",
    outOfBounds: "x / 10",
    outOfBoundsMessage: "去掉个位",
    blankWant: "x % 10",
    scenario: "写出取出十进制个位的算式",
  },
  {
    directory: "s3-02",
    storageKey: "csp-cpp-s3-02-progress-v1",
    micro: "factMicro",
    input: "factInput",
    check: "factCheckButton",
    hint: "factHintButton",
    ref: "factRefButton",
    reset: "factResetButton",
    hintPanel: "factHint",
    refPanel: "factRef",
    typedField: "factTyped",
    draftField: "factDraft",
    good: "n * fact(n - 1)",
    fullWidth: "n ＊ fact（n - 1）",
    fullWidthHint: "半角",
    outOfBounds: "n * fact(n)",
    outOfBoundsMessage: "边界",
    blankWant: "n * fact(",
    scenario: "写出阶乘的递归调用",
  },
  {
    directory: "s3-03",
    storageKey: "csp-cpp-s3-03-progress-v1",
    micro: "midMicro",
    input: "midInput",
    check: "midCheckButton",
    hint: "midHintButton",
    ref: "midRefButton",
    reset: "midResetButton",
    hintPanel: "midHint",
    refPanel: "midRef",
    typedField: "midTyped",
    draftField: "midDraft",
    good: "(left + right) / 2",
    fullWidth: "（left ＋ right）／ 2",
    fullWidthHint: "半角",
    outOfBounds: "left + right / 2",
    outOfBoundsMessage: "少了括号",
    blankWant: "(left + right) / 2",
    scenario: "写出二分的中点算式",
  },
  {
    directory: "s3-04",
    storageKey: "csp-cpp-s3-04-progress-v1",
    micro: "prefixMicro",
    input: "prefixInput",
    check: "prefixCheckButton",
    hint: "prefixHintButton",
    ref: "prefixRefButton",
    reset: "prefixResetButton",
    hintPanel: "prefixHint",
    refPanel: "prefixRef",
    typedField: "prefixTyped",
    draftField: "prefixDraft",
    good: "sum[i] = sum[i - 1] + a[i]",
    fullWidth: "sum［i］ ＝ sum［i － 1］ ＋ a［i］",
    fullWidthHint: "半角",
    outOfBounds: "sum[i] = sum[i] + a[i]",
    outOfBoundsMessage: "少减了",
    blankWant: "sum[i] = sum[i - 1] + a[i]",
    scenario: "写出填表（前缀和）语句",
  },
  {
    directory: "s3-05",
    storageKey: "csp-cpp-s3-05-progress-v1",
    micro: "windowMicro",
    input: "windowInput",
    check: "windowCheckButton",
    hint: "windowHintButton",
    ref: "windowRefButton",
    reset: "windowResetButton",
    hintPanel: "windowHint",
    refPanel: "windowRef",
    typedField: "windowTyped",
    draftField: "windowDraft",
    good: "right++; sum += a[right];",
    fullWidth: "right＋＋； sum ＋= a［right］；",
    fullWidthHint: "半角",
    outOfBounds: "sum += a[right]; right++;",
    outOfBoundsMessage: "顺序反了",
    blankWant: "right++; sum += a[right];",
    scenario: "写出扩大窗口的两步",
  },
  {
    directory: "s3-06",
    storageKey: "csp-cpp-s3-06-progress-v1",
    micro: "greedyMicro",
    input: "greedyInput",
    check: "greedyCheckButton",
    hint: "greedyHintButton",
    ref: "greedyRefButton",
    reset: "greedyResetButton",
    hintPanel: "greedyHint",
    refPanel: "greedyRef",
    typedField: "greedyTyped",
    draftField: "greedyDraft",
    good: "sort(a + 1, a + 4, by_end)",
    fullWidth: "sort（a ＋ 1， a ＋ 4， by_end）",
    fullWidthHint: "半角",
    outOfBounds: "sort(a + 1, a + 4, by_start)",
    outOfBoundsMessage: "开始时间",
    blankWant: "sort(a + 1, a + 4, by_end)",
    scenario: "写出按结束时间排序的那一行",
  },
  {
    directory: "s3-07",
    storageKey: "csp-cpp-s3-07-progress-v1",
    micro: "stackMicro",
    input: "stackInput",
    check: "stackCheckButton",
    hint: "stackHintButton",
    ref: "stackRefButton",
    reset: "stackResetButton",
    hintPanel: "stackHint",
    refPanel: "stackRef",
    typedField: "stackTyped",
    draftField: "stackDraft",
    good: "st.pop()",
    fullWidth: "st．pop（）",
    fullWidthHint: "半角",
    outOfBounds: "st.top()",
    outOfBoundsMessage: "看一眼",
    blankWant: "st.____()",
    scenario: "写出配对成功后弹掉栈顶的那一行",
  },
  {
    directory: "s3-08",
    storageKey: "csp-cpp-s3-08-progress-v1",
    micro: "dpMicro",
    input: "dpInput",
    check: "dpCheckButton",
    hint: "dpHintButton",
    ref: "dpRefButton",
    reset: "dpResetButton",
    hintPanel: "dpHint",
    refPanel: "dpRef",
    typedField: "dpTyped",
    draftField: "dpDraft",
    good: "dp[i] = dp[i - 1] + dp[i - 2]",
    fullWidth: "dp［i］＝dp［i － 1］＋dp［i － 2］",
    fullWidthHint: "半角",
    outOfBounds: "dp[i] = dp[i - 1] * dp[i - 2]",
    outOfBoundsMessage: "相加",
    blankWant: "dp[i] = dp[i - _] + dp[i - _]",
    scenario: "写出爬楼梯的转移那一行",
  },
  {
    directory: "s4-01",
    storageKey: "csp-cpp-s4-01-progress-v1",
    micro: "outputMicro",
    input: "outputInput",
    check: "outputCheckButton",
    hint: "outputHintButton",
    ref: "outputRefButton",
    reset: "outputResetButton",
    hintPanel: "outputHint",
    refPanel: "outputRef",
    typedField: "outputTyped",
    draftField: "outputDraft",
    good: "cout << n + 1;",
    fullWidth: "cout ＜＜ n ＋ 1；",
    fullWidthHint: "半角",
    outOfBounds: "cin >> n + 1;",
    outOfBoundsMessage: "cin",
    blankWant: "cout << ____;",
    scenario: "写出只输出答案的那一行",
  },
  {
    directory: "s4-02",
    storageKey: "csp-cpp-s4-02-progress-v1",
    micro: "sumMicro",
    input: "sumInput",
    check: "sumCheckButton",
    hint: "sumHintButton",
    ref: "sumRefButton",
    reset: "sumResetButton",
    hintPanel: "sumHint",
    refPanel: "sumRef",
    typedField: "sumTyped",
    draftField: "sumDraft",
    good: "sum += a[i];",
    fullWidth: "sum ＋= a［i］；",
    fullWidthHint: "半角",
    outOfBounds: "sum = a[i];",
    outOfBoundsMessage: "覆盖",
    blankWant: "sum ____ a[i];",
    scenario: "写出把当前这个数累加进 sum 的那一行",
  },
  {
    directory: "s4-03",
    storageKey: "csp-cpp-s4-03-progress-v1",
    micro: "guardMicro",
    input: "guardInput",
    check: "guardCheckButton",
    hint: "guardHintButton",
    ref: "guardRefButton",
    reset: "guardResetButton",
    hintPanel: "guardHint",
    refPanel: "guardRef",
    typedField: "guardTyped",
    draftField: "guardDraft",
    good: "if (balance + x >= 0)",
    fullWidth: "if （balance ＋ x ＞= 0）",
    fullWidthHint: "半角",
    outOfBounds: "if (balance + x > 0)",
    outOfBoundsMessage: "刚好",
    blankWant: "if (____)",
    scenario: "写出判断这次操作能不能做的那一行",
  },
  {
    directory: "s4-04",
    storageKey: "csp-cpp-s4-04-progress-v1",
    micro: "pruneMicro",
    input: "pruneInput",
    check: "pruneCheckButton",
    hint: "pruneHintButton",
    ref: "pruneRefButton",
    reset: "pruneResetButton",
    hintPanel: "pruneHint",
    refPanel: "pruneRef",
    typedField: "pruneTyped",
    draftField: "pruneDraft",
    good: "if (sum > target) return;",
    fullWidth: "if （sum ＞ target） return；",
    fullWidthHint: "半角",
    outOfBounds: "if (sum >= target) return;",
    outOfBoundsMessage: "边界差一点",
    blankWant: "if (sum ____ target) return;",
    scenario: "写出剪枝那一行",
  },
  {
    directory: "s4-05",
    storageKey: "csp-cpp-s4-05-progress-v1",
    micro: "countMicro",
    input: "countInput",
    check: "countCheckButton",
    hint: "countHintButton",
    ref: "countRefButton",
    reset: "countResetButton",
    hintPanel: "countHint",
    refPanel: "countRef",
    typedField: "countTyped",
    draftField: "countDraft",
    good: "cnt[score]++;",
    fullWidth: "cnt［score］＋＋；",
    fullWidthHint: "半角",
    outOfBounds: "cnt[score] = 1;",
    outOfBoundsMessage: "覆盖",
    blankWant: "cnt[score]____;",
    taskOnePicks: ['[data-quantity="rangeTool"] [data-choice="counting"]', '[data-quantity="dupTool"] [data-choice="sortScan"]'],
    scenario: "写出把这次读到的分数记进计数数组的那一行",
  },
  {
    directory: "s4-06",
    storageKey: "csp-cpp-s4-06-progress-v1",
    micro: "transitionMicro",
    input: "transitionInput",
    check: "transitionCheckButton",
    hint: "transitionHintButton",
    ref: "transitionRefButton",
    reset: "transitionResetButton",
    hintPanel: "transitionHint",
    refPanel: "transitionRef",
    typedField: "transitionTyped",
    draftField: "transitionDraft",
    good: "dp[i] = max(dp[i - 1], dp[i - 2] + nums[i]);",
    fullWidth: "dp［i］＝max（dp［i－1］，dp［i－2］＋nums［i］）；",
    fullWidthHint: "半角",
    outOfBounds: "dp[i] = max(dp[i - 1], dp[i - 2]);",
    outOfBoundsMessage: "少了金额",
    blankWant: "dp[i] = max(dp[i - 1], ____);",
    taskOnePicks: ['[data-quantity="stateTool"] [data-choice="define-dp"]', '[data-quantity="pickTool"] [data-choice="pick-or-skip"]'],
    scenario: "写出打家劫舍的转移那一行",
  },
  {
    directory: "s4-07",
    storageKey: "csp-cpp-s4-07-progress-v1",
    micro: "guardMicro",
    input: "guardInput",
    check: "guardCheckButton",
    hint: "guardHintButton",
    ref: "guardRefButton",
    reset: "guardResetButton",
    hintPanel: "guardHint",
    refPanel: "guardRef",
    typedField: "guardTyped",
    draftField: "guardDraft",
    good: "if (visited[u]) return;",
    fullWidth: "if（visited［u］）return；",
    fullWidthHint: "半角",
    outOfBounds: "if (!visited[u]) return;",
    outOfBoundsMessage: "写反",
    blankWant: "if (____) return;",
    taskOnePicks: ['[data-quantity="graphTool"] [data-choice="adjacency-list"]', '[data-quantity="visitedTool"] [data-choice="visited-array"]'],
    scenario: "写出 dfs 防止重复访问的那一行",
  },
  {
    directory: "s4-08",
    storageKey: "csp-cpp-s4-08-progress-v1",
    micro: "fallbackMicro",
    input: "fallbackInput",
    check: "fallbackCheckButton",
    hint: "fallbackHintButton",
    ref: "fallbackRefButton",
    reset: "fallbackResetButton",
    hintPanel: "fallbackHint",
    refPanel: "fallbackRef",
    typedField: "fallbackTyped",
    draftField: "fallbackDraft",
    good: "if (n <= 1000) { cout << brute(n); return 0; }",
    fullWidth: "if（n ＜= 1000）｛cout ＜＜ brute（n）；return 0；｝",
    fullWidthHint: "半角",
    outOfBounds: "if (n <= 100000) { cout << brute(n); return 0; }",
    outOfBoundsMessage: "10 万",
    blankWant: "if (____) { ... }",
    taskOnePicks: ['[data-quantity="orderChoice"] [data-choice="brute-first"]', '[data-quantity="fallbackChoice"] [data-choice="submit-fallback"]'],
    scenario: "写出子任务 1 的保底分支那一行",
  },
  {
    directory: "s5-02",
    storageKey: "csp-cpp-s5-02-progress-v1",
    micro: "debugPrintMicro",
    input: "debugPrintInput",
    check: "debugPrintCheckButton",
    hint: "debugPrintHintButton",
    ref: "debugPrintRefButton",
    reset: "debugPrintResetButton",
    hintPanel: "debugPrintHint",
    refPanel: "debugPrintRef",
    typedField: "debugPrintTyped",
    draftField: "debugPrintDraft",
    good: 'cout << i << " " << prefix;',
    fullWidth: 'cout ＜＜ i ＜＜ " " ＜＜ prefix；',
    fullWidthHint: "半角",
    outOfBounds: "cin >> i >> prefix;",
    outOfBoundsMessage: "读入",
    blankWant: "cout << ____;",
    taskOnePicks: [
      '[data-quantity="orderChoice"] [data-choice="brute-first"]',
      '[data-quantity="fallbackChoice"] [data-choice="submit-fallback"]',
    ],
    scenario: "写出循环里的分段输出那一行",
  },
  {
    directory: "s5-03",
    storageKey: "csp-cpp-s5-03-progress-v1",
    micro: "sumTypeMicro",
    input: "sumTypeInput",
    check: "sumTypeCheckButton",
    hint: "sumTypeHintButton",
    ref: "sumTypeRefButton",
    reset: "sumTypeResetButton",
    hintPanel: "sumTypeHint",
    refPanel: "sumTypeRef",
    typedField: "sumTypeTyped",
    draftField: "sumTypeDraft",
    good: "long long sum = 0;",
    fullWidth: "long long sum ＝ 0；",
    fullWidthHint: "半角",
    outOfBounds: "int sum = 0;",
    outOfBoundsMessage: "装不下",
    blankWant: "____ sum = 0;",
    taskOnePicks: [
      '[data-quantity="overflowChoice"] [data-choice="is-overflow"]',
      '[data-quantity="boundsChoice"] [data-choice="is-bounds"]',
    ],
    scenario: "写出累加变量的那一行声明",
  },
  {
    directory: "s5-04",
    storageKey: "csp-cpp-s5-04-progress-v1",
    micro: "rangeQueryMicro",
    input: "rangeQueryInput",
    check: "rangeQueryCheckButton",
    hint: "rangeQueryHintButton",
    ref: "rangeQueryRefButton",
    reset: "rangeQueryResetButton",
    hintPanel: "rangeQueryHint",
    refPanel: "rangeQueryRef",
    typedField: "rangeQueryTyped",
    draftField: "rangeQueryDraft",
    good: "sum[r] - sum[l - 1]",
    fullWidth: "sum［r］－sum［l－1］",
    fullWidthHint: "半角",
    outOfBounds: "sum[r] - sum[l]",
    outOfBoundsMessage: "伪优化",
    blankWant: "sum[ r ] - sum[ ? ]",
    taskOnePicks: [
      '[data-quantity="startChoice"] [data-choice="write-baseline"]',
      '[data-quantity="labelChoice"] [data-choice="label-limits"]',
    ],
    scenario: "写出升级后区间和的那一个算式",
  },
  {
    directory: "s5-05",
    storageKey: "csp-cpp-s5-05-progress-v1",
    micro: "emptyGuardMicro",
    input: "emptyGuardInput",
    check: "emptyGuardCheckButton",
    hint: "emptyGuardHintButton",
    ref: "emptyGuardRefButton",
    reset: "emptyGuardResetButton",
    hintPanel: "emptyGuardHint",
    refPanel: "emptyGuardRef",
    typedField: "emptyGuardTyped",
    draftField: "emptyGuardDraft",
    good: 'if (n == 0) { cout << 0 << "\\n"; return 0; }',
    fullWidth: 'if （n ＝＝ 0） ｛ cout ＜＜ 0 ＜＜ "\\n"； return 0； ｝',
    fullWidthHint: "半角",
    outOfBounds: 'if (n == 1) { cout << 0 << "\\n"; return 0; }',
    outOfBoundsMessage: "n=0",
    blankWant: "if ( n == 0 ) { ... }",
    taskOnePicks: [
      '[data-quantity="startChoice"] [data-choice="scan-and-order"]',
      '[data-quantity="labelChoice"] [data-choice="log-self-test"]',
    ],
    scenario: "写出空数据时输出 0 并结束的那一段",
  },
  {
    directory: "s5-06",
    storageKey: "csp-cpp-s5-06-progress-v1",
    micro: "loopBoundMicro",
    input: "loopBoundInput",
    check: "loopBoundCheckButton",
    hint: "loopBoundHintButton",
    ref: "loopBoundRefButton",
    reset: "loopBoundResetButton",
    hintPanel: "loopBoundHint",
    refPanel: "loopBoundRef",
    typedField: "loopBoundTyped",
    draftField: "loopBoundDraft",
    good: "i <= n",
    fullWidth: "i ＜= n",
    fullWidthHint: "半角",
    outOfBounds: "i < n",
    outOfBoundsMessage: "最后一个",
    blankWant: "i ? n",
    taskOnePicks: [
      '[data-quantity="startChoice"] [data-choice="classify-first"]',
      '[data-quantity="actionChoice"] [data-choice="write-fix-rule"]',
    ],
    scenario: "写出让循环走到最后一个下标的那一个条件",
  },
  {
    directory: "s5-01",
    storageKey: "csp-cpp-s5-01-progress-v1",
    micro: "arraySizeMicro",
    input: "arraySizeInput",
    check: "arraySizeCheckButton",
    hint: "arraySizeHintButton",
    ref: "arraySizeRefButton",
    reset: "arraySizeResetButton",
    hintPanel: "arraySizeHint",
    refPanel: "arraySizeRef",
    typedField: "arraySizeTyped",
    draftField: "arraySizeDraft",
    good: "int a[100005];",
    fullWidth: "int a［100005］；",
    fullWidthHint: "半角",
    outOfBounds: "int a[100000];",
    outOfBoundsMessage: "越界",
    blankWant: "int a[ ? ];",
    taskOnePicks: [
      '[data-quantity="orderChoice"] [data-choice="brute-first"]',
      '[data-quantity="fallbackChoice"] [data-choice="submit-fallback"]',
    ],
    scenario: "按审题圈出的数据范围写出数组那一行",
  },
  {
    directory: "s5-07",
    storageKey: "csp-cpp-s5-07-progress-v1",
    micro: "crossCheckMicro",
    input: "crossCheckInput",
    check: "crossCheckCheckButton",
    hint: "crossCheckHintButton",
    ref: "crossCheckRefButton",
    reset: "crossCheckResetButton",
    hintPanel: "crossCheckHint",
    refPanel: "crossCheckRef",
    typedField: "crossCheckTyped",
    draftField: "crossCheckDraft",
    good: "long long formula = 1LL * n * (n + 1) / 2;",
    fullWidth: "long long formula ＝ 1LL ＊ n ＊ （n ＋ 1） ／ 2；",
    fullWidthHint: "半角",
    outOfBounds: "long long formula = n * (n + 1) / 2;",
    outOfBoundsMessage: "溢出",
    blankWant: "long long formula = ____;",
    taskOnePicks: [
      '[data-quantity="startChoice"] [data-choice="bring-last-habit"]',
      '[data-quantity="labelChoice"] [data-choice="cross-check-twice"]',
    ],
    scenario: "写出交叉检查时独立再算一遍的那一行",
  },
  {
    directory: "s5-08",
    storageKey: "csp-cpp-s5-08-progress-v1",
    micro: "arrayInitMicro",
    input: "arrayInitInput",
    check: "arrayInitCheckButton",
    hint: "arrayInitHintButton",
    ref: "arrayInitRefButton",
    reset: "arrayInitResetButton",
    hintPanel: "arrayInitHint",
    refPanel: "arrayInitRef",
    typedField: "arrayInitTyped",
    draftField: "arrayInitDraft",
    good: "int cnt[105] = {0};",
    fullWidth: "int cnt［105］ ＝ ｛0｝；",
    fullWidthHint: "半角",
    outOfBounds: "int cnt[105] = 0;",
    outOfBoundsMessage: "第一个格子",
    blankWant: "int cnt[ ? ] = ?;",
    taskOnePicks: [
      '[data-quantity="startChoice"] [data-choice="list-and-rate"]',
      '[data-quantity="labelChoice"] [data-choice="specific-topic-with-plan"]',
    ],
    scenario: "写出赛前清单里计数数组清零的那一行",
  },
];

// 默认跑全部；CSP_E2E_LESSONS=s3-01,s3-03 可以只跑指定几课。
const requestedLessons = (Bun.env.CSP_E2E_LESSONS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
const unknownLessons = requestedLessons.filter((value) => !lessons.some((lesson) => lesson.directory === value));

if (unknownLessons.length > 0) {
  console.error(`CSP_E2E_LESSONS 里有不认识的课程：${unknownLessons.join(", ")}`);
  process.exit(1);
}

const selectedLessons =
  requestedLessons.length > 0 ? lessons.filter((lesson) => requestedLessons.includes(lesson.directory)) : lessons;

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const servers: Bun.Subprocess[] = [];
const browsers: Bun.Subprocess[] = [];
const tempDirs: string[] = [];
const chromeLog: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -> ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function reachable(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(url: string, description: string, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    if (await reachable(url)) return;
    await Bun.sleep(250);
  }
  const tail = chromeLog.slice(-12).join("\n");
  throw new Error(`等待${description}超时：${url}${tail ? `\nChrome 输出末尾：\n${tail}` : ""}`);
}

function collect(stream: ReadableStream<Uint8Array> | undefined) {
  if (!stream) return;
  void (async () => {
    for await (const chunk of stream) chromeLog.push(new TextDecoder().decode(chunk));
  })();
}

async function ensureDevServer() {
  if (Bun.env.CSP_E2E_ORIGIN || (await reachable(`${origin}/`))) return;
  console.log(`启动开发服务器：bun scripts/dev.ts（端口 ${port}）`);
  servers.push(
    Bun.spawn(["bun", "scripts/dev.ts"], {
      cwd: projectRoot,
      env: { ...Bun.env, PORT: String(port) },
      stdout: "ignore",
      stderr: "ignore",
    }),
  );
  await waitFor(`${origin}/`, "开发服务器");
}

async function ensureChrome() {
  const endpoint = `http://localhost:${cdpPort}/json/version`;
  if (await reachable(endpoint)) return;

  const binary = chromeCandidates.find((candidate) => existsSync(candidate));
  if (!binary) {
    throw new Error(
      `未找到 Chrome。请安装 Chrome，或用 CSP_E2E_CHROME 指定可执行文件路径（已尝试：${chromeCandidates.join("、")}）。`,
    );
  }

  const profileDir = mkdtempSync(join(tmpdir(), "csp-e2e-s2-profile-"));
  tempDirs.push(profileDir);
  console.log(`启动无头 Chrome：${binary}`);
  const browser = Bun.spawn(
    [
      binary,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${cdpPort}`,
      "about:blank",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  browsers.push(browser);
  collect(browser.stdout as ReadableStream<Uint8Array>);
  collect(browser.stderr as ReadableStream<Uint8Array>);
  await waitFor(endpoint, "无头 Chrome 调试端口");
}

class Cdp {
  #socket: WebSocket;
  #pending = new Map<number, (message: any) => void>();
  #seq = 0;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.#pending.has(message.id)) {
        this.#pending.get(message.id)!(message);
        this.#pending.delete(message.id);
      }
    };
  }

  static async attach(cdpPort: number) {
    const targets = (await (await fetch(`http://localhost:${cdpPort}/json/list`)).json()) as any[];
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (!page) throw new Error("没有可用的浏览器页面目标。");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("无法连接浏览器调试通道。"));
    });
    const client = new Cdp(socket);
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    return client;
  }

  send(method: string, params: Record<string, unknown> = {}) {
    const id = ++this.#seq;
    return new Promise<any>((resolve) => {
      this.#pending.set(id, resolve);
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const message = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (message.result?.exceptionDetails) {
      throw new Error(`页面抛出异常：${JSON.stringify(message.result.exceptionDetails).slice(0, 500)}`);
    }
    return message.result?.result?.value as T;
  }

  async evaluateJson<T = Record<string, unknown>>(expression: string): Promise<T> {
    return JSON.parse(await this.evaluate<string>(expression)) as T;
  }

  close() {
    this.#socket.close();
  }
}

const lessonReady = `new Promise((resolve) => {
  const tick = () => (document.querySelector("#quizForm") ? resolve(true) : setTimeout(tick, 100));
  tick();
})`;

const selector = (id: string) => `#${id}`;

async function clearInput(client: Cdp, target: string) {
  await client.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector(target))});
    el.focus();
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
}

// 逐字符走真实键盘事件，验证孩子真的敲键盘时输入框与状态都跟得上。
async function typeText(client: Cdp, target: string, text: string) {
  await client.evaluate(`document.querySelector(${JSON.stringify(selector(target))}).focus(); true`);
  for (const character of text) {
    // keyDown 报“按下哪个键”，char 负责真正插入字符：标点没有合法的 code（如 `<`），
    // 只把 text 挂在 keyDown 上会被丢弃，必须补一个 char 事件。
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: character });
    await client.send("Input.dispatchKeyEvent", {
      type: "char",
      text: character,
      unmodifiedText: character,
    });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: character });
  }
}

async function click(client: Cdp, target: string) {
  return client.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector(target))});
    if (!el) return false;
    el.click();
    return true;
  })()`);
}

async function readStorage(client: Cdp, key: string) {
  return client.evaluateJson<any>(
    `JSON.stringify(JSON.parse(localStorage.getItem(${JSON.stringify(key)}) ?? "null") ?? {})`,
  );
}

async function microSnapshot(client: Cdp, lesson: LessonConfig) {
  return client.evaluateJson<any>(`(() => {
    const micro = document.querySelector(${JSON.stringify(selector(lesson.micro))});
    const input = document.querySelector(${JSON.stringify(selector(lesson.input))});
    const hintPanel = document.querySelector(${JSON.stringify(selector(lesson.hintPanel))});
    const refPanel = document.querySelector(${JSON.stringify(selector(lesson.refPanel))});
    const ribbon = document.querySelector("#completionRibbon");
    return JSON.stringify({
      microHidden: micro ? micro.hidden : null,
      inputValue: input ? input.value : null,
      inputCorrect: input ? input.classList.contains("is-correct") : null,
      inputWrong: input ? input.classList.contains("is-wrong") : null,
      feedback: hintPanel ? hintPanel.textContent : null,
      feedbackTone: hintPanel ? hintPanel.dataset.tone ?? "" : null,
      refHidden: refPanel ? refPanel.hidden : null,
      ribbon: ribbon ? ribbon.textContent : "",
    });
  })()`);
}

let client: Cdp | null = null;
let failure: unknown = null;

try {
  await ensureDevServer();
  await ensureChrome();
  client = await Cdp.attach(cdpPort);

  for (const lesson of selectedLessons) {
    section(`E2E-${lesson.directory} 微编程：${lesson.scenario}`);

    await client.send("Page.navigate", { url: `${origin}/lessons/${lesson.directory}/` });
    await Bun.sleep(1200);
    await client.evaluate(lessonReady);
    await client.evaluate(`try { localStorage.clear(); } catch {} true`);
    await client.send("Page.reload");
    await Bun.sleep(1200);
    await client.evaluate(lessonReady);

    // 任务 1：两处选择都选对，任务 2 才会点亮
    const taskOnePicks = lesson.taskOnePicks ?? [
      '[data-quantity="passFail"] [data-choice="compare"]',
      '[data-quantity="grade"] [data-choice="three-way"]',
    ];
    await client.evaluate(`(() => {
      for (const selector of ${JSON.stringify(taskOnePicks)}) {
        const button = document.querySelector(selector);
        if (!button) throw new Error("任务 1 找不到按钮：" + selector);
        button.click();
      }
      return true;
    })()`);

    const scaffold = await client.evaluateJson<any>(`(() => {
      const input = document.querySelector(${JSON.stringify(selector(lesson.input))});
      const micro = document.querySelector(${JSON.stringify(selector(lesson.micro))});
      return JSON.stringify({
        exists: Boolean(input) && Boolean(micro),
        type: input ? input.type : null,
        font: input ? getComputedStyle(input).fontFamily : null,
        autocapitalize: input ? input.getAttribute("autocapitalize") : null,
        autocorrect: input ? input.getAttribute("autocorrect") : null,
        spellcheck: input ? input.getAttribute("spellcheck") : null,
        ariaLabel: input ? input.getAttribute("aria-label") : null,
      });
    })()`);

    check(
      `${lesson.directory} 提供了等宽输入框并带上防自动大写/纠错属性`,
      scaffold.exists &&
        scaffold.type === "text" &&
        /mono/i.test(String(scaffold.font)) &&
        scaffold.autocapitalize === "none" &&
        scaffold.autocorrect === "off" &&
        scaffold.spellcheck === "false" &&
        Boolean(scaffold.ariaLabel),
      JSON.stringify(scaffold),
    );

    const scaffoldLines = await client.evaluate(`document.querySelectorAll(${JSON.stringify(
      `#${lesson.micro} .code-sheet li`,
    )}).length`);

    check(`${lesson.directory} 脚手架为只读且只留一空`, scaffoldLines >= 3, `代码行数=${scaffoldLines}`);

    // 任务 2：走完三格之前不能出现输入框
    await click(client, "divideButton");
    await click(client, "remainderButton");
    const before = await microSnapshot(client, lesson);
    check(`${lesson.directory} 走完前两步时输入框仍隐藏`, before.microHidden === true, `hidden=${before.microHidden}`);

    await click(client, "evenButton");
    const opened = await microSnapshot(client, lesson);
    check(`${lesson.directory} 走完第三步后输入框出现`, opened.microHidden === false, `hidden=${opened.microHidden}`);

    // 空提交：必须给出提示且不算完成
    await click(client, lesson.check);
    const blank = await microSnapshot(client, lesson);
    const blankState = await readStorage(client, lesson.storageKey);
    check(
      `${lesson.directory} 空提交给出“先敲字”的指正且不算完成`,
      Boolean(blank.feedback) && blank.feedbackTone === "error" && blankState[lesson.typedField] !== true,
      `feedback=${String(blank.feedback).slice(0, 60)}`,
    );

    // 全角符号：必须提示半角
    await clearInput(client, lesson.input);
    await typeText(client, lesson.input, lesson.fullWidth);
    const typedDraft = await readStorage(client, lesson.storageKey);
    check(
      `${lesson.directory} 真实键盘输入会写进草稿`,
      typedDraft[lesson.draftField] === lesson.fullWidth,
      `draft=${String(typedDraft[lesson.draftField])}`,
    );

    await click(client, lesson.check);
    const fullWidth = await microSnapshot(client, lesson);
    const fullWidthState = await readStorage(client, lesson.storageKey);
    check(
      `${lesson.directory} 全角符号被指正为半角且不算完成`,
      String(fullWidth.feedback).includes(lesson.fullWidthHint) &&
        fullWidth.inputWrong === true &&
        fullWidthState[lesson.typedField] !== true,
      `feedback=${String(fullWidth.feedback).slice(0, 80)}`,
    );

    // 语义错误：越界 / 缺括号必须点出原因
    await clearInput(client, lesson.input);
    await typeText(client, lesson.input, lesson.outOfBounds);
    await click(client, lesson.check);
    const semantic = await microSnapshot(client, lesson);
    const semanticState = await readStorage(client, lesson.storageKey);
    check(
      `${lesson.directory} 语义错误被点出原因（${lesson.outOfBoundsMessage}）且不算完成`,
      String(semantic.feedback).includes(lesson.outOfBoundsMessage) && semanticState[lesson.typedField] !== true,
      `feedback=${String(semantic.feedback).slice(0, 80)} draft=${JSON.stringify(String(semanticState[lesson.draftField]))}`,
    );

    // 提示按钮：卡壳时有渐进线索
    await click(client, lesson.hint);
    const hint = await microSnapshot(client, lesson);
    check(`${lesson.directory} 查看提示给出渐进线索`, Boolean(hint.feedback), `hint=${String(hint.feedback).slice(0, 60)}`);

    // 参考代码：可展开也可收起
    await click(client, lesson.ref);
    const refOpen = await microSnapshot(client, lesson);
    await click(client, lesson.ref);
    const refClosed = await microSnapshot(client, lesson);
    check(
      `${lesson.directory} 参考代码可展开可收起`,
      refOpen.refHidden === false && refClosed.refHidden === true,
      `open=${refOpen.refHidden} closed=${refClosed.refHidden}`,
    );

    // 重置：清空这一空与草稿
    await click(client, lesson.reset);
    const reset = await microSnapshot(client, lesson);
    const resetState = await readStorage(client, lesson.storageKey);
    check(
      `${lesson.directory} 重置会清空输入框与草稿`,
      reset.inputValue === "" && resetState[lesson.draftField] === "" && reset.refHidden === true,
      `value=${String(reset.inputValue)} draft=${String(resetState[lesson.draftField])}`,
    );

    // 安全边界：这一空只做字符串比较，原样保留、绝不当 HTML 解析（此时任务 1 面板仍可见，输入框可用）
    const injectedRaw = "<script>x</script>";
    await clearInput(client, lesson.input);
    await typeText(client, lesson.input, injectedRaw);
    await click(client, lesson.check);
    const injected = await microSnapshot(client, lesson);
    const injectedState = await readStorage(client, lesson.storageKey);
    const parsedNodes = await client.evaluateJson<number>(
      `document.querySelectorAll(${JSON.stringify(`${selector(lesson.micro)} script`)}).length`,
    );
    check(
      `${lesson.directory} 输入框内容原样保留，不会被当成 HTML 或正确答案`,
      parsedNodes === 0 &&
        injected.inputValue === injectedRaw &&
        injectedState[lesson.typedField] !== true &&
        injectedState.activeStep === 1,
      `raw=${String(injected.inputValue)} parsedNodes=${parsedNodes} typed=${String(injectedState[lesson.typedField])}`,
    );

    // 正确作答：解锁任务 3 并给出奖励反馈
    await clearInput(client, lesson.input);
    await typeText(client, lesson.input, lesson.good);
    await click(client, lesson.check);
    const solved = await microSnapshot(client, lesson);
    const solvedState = await readStorage(client, lesson.storageKey);
    check(
      `${lesson.directory} 正确作答后标记完成、进入任务 3 并给出反馈`,
      solved.inputCorrect === true &&
        solvedState[lesson.typedField] === true &&
        solvedState.activeStep >= 2 &&
        String(solved.ribbon).length > 0,
      `typed=${String(solvedState[lesson.typedField])} activeStep=${String(solvedState.activeStep)}`,
    );

    // 刷新后草稿与完成状态都要恢复
    await client.send("Page.reload");
    await Bun.sleep(1200);
    await client.evaluate(lessonReady);
    const restored = await microSnapshot(client, lesson);
    check(
      `${lesson.directory} 刷新后恢复这一空的答案与完成状态`,
      restored.inputValue === lesson.good && restored.inputCorrect === true,
      `value=${String(restored.inputValue)}`,
    );

    // 抽出来的题不能只丢一句自由文本：检查目标要是本课学习目标的原文，
    // 同时另起一行保留“这道题具体查什么”。模板写坏（例如渲染成 undefined）只有真渲染才看得出。
    const quizBinding = await client.evaluateJson<any>(`(() => {
      const questions = [...document.querySelectorAll("#quizForm section.question")];
      const text = (node) => (node ? node.textContent.trim() : "");
      return JSON.stringify({
        goals: typeof courseObjectives === "undefined" ? null : courseObjectives,
        objectives: questions.map((question) => text(question.querySelector(".question-objective"))),
        checkpoints: questions.map((question) => text(question.querySelector(".question-checkpoint"))),
      });
    })()`);

    check(
      `${lesson.directory} 抽出的题都把检查目标绑到本课学习目标原文`,
      Array.isArray(quizBinding.goals) &&
        quizBinding.objectives.length === 3 &&
        quizBinding.objectives.every((line: string) => quizBinding.goals.includes(line.replace("检查目标：", ""))),
      `目标 ${JSON.stringify(quizBinding.goals)} 显示 ${JSON.stringify(quizBinding.objectives[0] ?? "")}`,
    );

    check(
      `${lesson.directory} 每题都保留一句更细的本题检查说明`,
      quizBinding.checkpoints.length === 3 && quizBinding.checkpoints.every((line: string) => /^本题检查：\S/.test(line)),
      `显示 ${JSON.stringify(quizBinding.checkpoints[0] ?? "")}`,
    );
  }
} catch (error) {
  failure = error;
} finally {
  client?.close();
  for (const browser of browsers) browser.kill();
  for (const server of servers) server.kill();
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} 项通过`);
if (failure) console.error(`脚本失败：${failure instanceof Error ? failure.message : String(failure)}`);
if (failure || failed.length > 0) process.exit(1);
console.log("微编程浏览器复验全部通过。");
