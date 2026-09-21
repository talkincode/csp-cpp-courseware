# CSP C++ Courseware

面向零基础学习者、以 **CSP-J 入门到提高** 为验收目标的 C++ 交互式课程项目。项目将长期学习路线拆成 5 个递进阶段、40 节课程；每一课都包含学习目标、具体内容、检验清单和练习建议。

> 课程强调“先把程序写对，再把题目做对”。CSP-J 是明确边界；CSP-S/NOI 的内容只在最后一课说明衔接方向，不作为本项目的承诺范围。

## 当前课程原型

仓库根目录的 [`index.html`](./index.html) 是无需构建的课程路线原型。它当前提供：

- 五阶段课程路径与阶段切换；
- 40 节课件的学习目标、讲授内容、检验清单和练习建议；
- 本地保存的逐项学习进度，不收集账号或个人信息；浏览器拒绝保存时会明确说明，并可在恢复后重试补写；
- 适合外部录课制作时使用的“视频组织建议”和移动端阅读布局。

它目前用于确认课程规划；每节课自己的在线学习页与随机测验已在 `lessons/<课程-id>/` 中实现（题库与解析已通过机器校验，证据见 `docs/review/question-verification.json`），做完一节后页面会给出「继续学习」入口，按课程顺序指向下一课的课件——最后一课换成课程收尾出口。视频始终由仓库外流程负责。后续交付范围与验收标准见 [`docs/roadmap.md`](./docs/roadmap.md)。

本地预览使用 Bun：

```bash
bun run dev          # 默认 http://127.0.0.1:4173
PORT=4199 bun run dev  # 换端口
HOST=0.0.0.0 bun run dev  # 想让同局域网的其它设备也能打开时才用
```

打开 <http://localhost:4173>。在线站点是 <https://cplus.talkincode.net>，构建与发布方式见下文「构建与发布」。

开发服务器只监听 `127.0.0.1`，并且只服务线上真正会有的那三份内容（`index.html`、`glossary/`、`lessons/`）——这份清单与构建、线上 Worker 共用 [`src/site.ts`](./src/site.ts) 里的同一份定义。仓库里的 `.git/`、`package.json`、`wrangler.jsonc`、`AGENTS.md`、`docs/` 等在本地也是中文 404，和线上一致；少了末尾斜杠的目录地址（`/lessons/s1-01`）会像线上那样跳到带斜杠的地址。想把这些内容也给同一局域网的其他设备看，必须自己显式写 `HOST=0.0.0.0`，默认不会。

## 课件目录

每节课都有自己的目录：`lessons/<小写课程-id>/`。全部 40 个目录及其 `lesson.json` 已由 Bun 脚手架建立；40 节互动课件与随机测验目前均已实现（题库与解析已通过机器校验，视频始终为仓库外交付）：

```text
lessons/s1-01/
├── index.html   # 引导式互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s1-02/
├── index.html   # 变量与数据类型的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s1-03/
├── index.html   # 表达式、整除、取模与括号的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s1-04/
├── index.html   # 输入输出格式的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s1-05/
├── index.html   # 条件判断、边界与亲手补条件的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s1-06/
├── index.html   # 循环、累加与死循环对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s1-07/
├── index.html   # 嵌套循环、行列职责与 break 对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s1-08/
├── index.html   # 三类错误、语法定位与小数据检查的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s2-01/
├── index.html   # 数组声明、下标 0 到 n-1 与越界对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s2-02/
├── index.html   # 字符与字符串区分、下标遍历与数字判断的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s2-03/
├── index.html   # 函数定义、参数返回值与闰年抽取的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s2-04/
├── index.html   # 局部变量、值传递与引用对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s2-05/
├── index.html   # 结构体记录卡、成员访问与按字段比较的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s2-06/
├── index.html   # 冒泡思想、相邻交换、sort 与稳定性对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s2-07/
├── index.html   # 枚举范围、状态更新、漏分支对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s2-08/
├── index.html   # 操作次数、O(n)/O(n²) 直觉与测试点对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s3-01/
├── index.html   # 数位拆分、辗转相除与循环停止对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s3-02/
├── index.html   # 递归边界、三层调用追踪与阶乘对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s3-03/
├── index.html   # 有序前提、左右边界收缩与首尾/死循环对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s3-04/
├── index.html   # 前缀和定义、区间公式与 l=1/下标偏移对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s3-05/
├── index.html   # 双指针含义、[1,2,3] 窗口扩张与空/满窗口对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s3-06/
├── index.html   # 贪心规则、选活动三步与反例对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s3-07/
├── index.html   # 栈与队列、([]) 入栈出栈与错配对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s3-08/
├── index.html   # 动态规划、爬楼梯前三步与初值对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s4-01/
├── index.html   # 题面范围、干净输出与样例对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s4-02/
├── index.html   # 建模卡、已知未知、样例反推与边界对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s4-03/
├── index.html   # 状态表、事件顺序、条件分支与样例追踪的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s4-04/
├── index.html   # DFS、搜索树、回溯与剪枝对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s4-05/
├── index.html   # 计数数组、排序、二分查找与重复元素对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s4-06/
├── index.html   # 状态定义（选或不选）、初始化、转移与不可达状态对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s4-07/
├── index.html   # 图的表示（邻接表）、访问标记、DFS 与 BFS 顺序差异对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s4-08/
├── index.html   # 做题顺序、保底方案、先易后难与复杂度降级对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s5-01/
├── index.html   # 审题计时、建模草稿、样例检查与预留检查时间对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s5-02/
├── index.html   # 最小复现、分段输出、断言思路与差分检查对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s5-03/
├── index.html   # 溢出/越界故障卡诊断、定位/改型/回归三步、比较符号与调试残留对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s5-04/
├── index.html   # 暴力基线、子任务标注与复杂度升级对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s5-05/
├── index.html   # 模拟赛提交顺序、自测表与时间记录对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s5-06/
├── index.html   # 错误分类、边界数据与重做关键题对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s5-07/
├── index.html   # 交叉检查、两次时间对照与稳定习惯判断的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
lessons/s5-08/
├── index.html   # 知识地图、薄弱模块标注与 CSP-S 衔接边界对照的互动学习与随机选择题小测
└── lesson.json  # 本课的交付状态；视频明确为仓库外实现
```

启动 `bun run dev` 后，打开 <http://localhost:4173/lessons/s1-01/>、<http://localhost:4173/lessons/s1-02/>、<http://localhost:4173/lessons/s1-03/>、<http://localhost:4173/lessons/s1-04/>、<http://localhost:4173/lessons/s1-05/>、<http://localhost:4173/lessons/s1-06/>、<http://localhost:4173/lessons/s1-07/>、<http://localhost:4173/lessons/s1-08/>、<http://localhost:4173/lessons/s2-01/>、<http://localhost:4173/lessons/s2-02/>、<http://localhost:4173/lessons/s2-03/>、<http://localhost:4173/lessons/s2-04/>、<http://localhost:4173/lessons/s2-05/>、<http://localhost:4173/lessons/s2-06/>、<http://localhost:4173/lessons/s2-07/>、<http://localhost:4173/lessons/s2-08/>、<http://localhost:4173/lessons/s3-01/>、<http://localhost:4173/lessons/s3-02/>、<http://localhost:4173/lessons/s3-03/>、<http://localhost:4173/lessons/s3-04/>、<http://localhost:4173/lessons/s3-05/>、<http://localhost:4173/lessons/s3-06/> 、<http://localhost:4173/lessons/s3-07/> 、<http://localhost:4173/lessons/s3-08/> 、<http://localhost:4173/lessons/s4-01/> 、<http://localhost:4173/lessons/s4-02/> 、<http://localhost:4173/lessons/s4-03/> 、<http://localhost:4173/lessons/s4-04/> 、<http://localhost:4173/lessons/s4-05/> 、<http://localhost:4173/lessons/s4-06/> 、<http://localhost:4173/lessons/s4-07/> 、<http://localhost:4173/lessons/s4-08/> 、 <http://localhost:4173/lessons/s5-01/> 、<http://localhost:4173/lessons/s5-02/> 、<http://localhost:4173/lessons/s5-03/> 、<http://localhost:4173/lessons/s5-04/> 、<http://localhost:4173/lessons/s5-05/> 、<http://localhost:4173/lessons/s5-06/> 、<http://localhost:4173/lessons/s5-07/> 或 <http://localhost:4173/lessons/s5-08/>。全部 40 节课程目录均已实现互动学习页与随机测验，题库与解析已通过机器校验。


课件里的陌生词（例如 `g++`）可点开 [`glossary/faq.json`](./glossary/faq.json) 中的基础解释。后续课件出现同类概念时，也必须引用同一份词条表。词条面板由全部课程共用：词条表载入失败（含返回 HTTP 错误）时当场说明、给出“重新载入词条表”入口，恢复后回到刚才点开的词条，课件其他互动不受影响。

## 五阶段课程路线

| 阶段 | 主题 | 课件数 | 关键结果 |
| --- | --- | ---: | --- |
| 第一阶段 | 建立程序感 | 8 | 能独立编译、读写、判断、循环并排错 |
| 第二阶段 | 写得正确 | 8 | 能用数组、字符串、函数和结构体组织程序 |
| 第三阶段 | 算法思维入门 | 8 | 能把常见题意转成枚举、搜索、前缀和、贪心或 DP |
| 第四阶段 | CSP-J 专项 | 8 | 能在题面、复杂度、实现和调试之间形成稳定闭环 |
| 第五阶段 | 赛场整合 | 8 | 能完成限时模拟、复盘并以 CSP-J 提高为目标参赛 |

完整课程目录见 [`docs/course-plan.md`](./docs/course-plan.md)。

## 后续课程形态

每一节课程最终都应成为一个独立、可在线学习的单元，包含：

- 与本课目标对应的网页互动学习界面；
- 可重复参加的在线测试，从经审校题库中随机组卷，并以选择题为主；
- 作答结果、解析和下一步复习建议。

每节课还有对应的视频课件，但视频由仓库外的制作流程实现和交付；本仓库不制作、存储或渲染视频资产，只维护课程 ID、目标与外部视频交付的对齐约定。

“随机”只指从经过验证的题库中进行可复现的抽取，不能用未校验的临时生成内容替代题目质量。具体边界见 [`AGENTS.md`](./AGENTS.md) 与路线图。

## 构建与发布

课程站点发布在 <https://cplus.talkincode.net>，由 Cloudflare Worker `csp-cpp-courseware` 托管静态资源：Worker 入口是 [`src/index.ts`](./src/index.ts)，站点与域名配置见 [`wrangler.jsonc`](./wrangler.jsonc)。

```bash
bun run build    # 把 index.html、glossary/、lessons/ 重新复制到 dist/
bun run deploy   # 先构建，再用 bunx wrangler deploy 发布 dist/
```

产物只能来自仓库内容：`bun run build` 每次都会清空并重建 `dist/`，`bun run deploy` 也会先跑一遍构建，所以线上不会出现「仓库里已经有这节课、站点上还是 404」的漂移。这个漂移真实发生过：站点一度停在 4 节课，而仓库已经补到 40 节课，原因是构建与部署只在某台机器上手工跑过一次、此后再没人重跑。

发布前先跑 `bun test`。其中 [`tests/deploy-assets.test.ts`](./tests/deploy-assets.test.ts) 守住这条链路：构建产物覆盖 `courseData` 里的每一节课（缺课、`dist/` 里残留上一次的旧页面都会失败）、课程地址的末尾斜杠跳转（静态资源的 `html_handling`）与 Worker 的中文 404 仍然在，以及部署目标（Worker 名、`dist` 目录、自定义域名）与文档写的是同一个。发布默认是自动的：main 上的每次推送都由 [`.github/workflows/test-and-deploy.yml`](./.github/workflows/test-and-deploy.yml) 接手——先跑 `bun test`，通过后 `bun run deploy` 发布，最后抽检线上（每一节课、末尾斜杠跳转、词条面板、中文 404），任一步失败都会让这次运行变红。它需要 `CLOUDFLARE_API_TOKEN`（权限 `Workers Scripts: Edit`；账号 ID 不是凭据，已经写在仓库里）——仓库级或组织级共享的 secret 都可以，缺它时发布步骤会明确失败、不会静默跳过。手动发布仍然可用：在有 Cloudflare 凭据的机器上 `bunx wrangler login` 之后 `bun run deploy`，出错用 `bunx wrangler rollback` 退回上一个版本。

发布后可以直接拿同一套浏览器复验打线上——`CSP_E2E_ORIGIN` 会复用已在运行的服务、不再自启开发服务器：

```bash
CSP_E2E_ORIGIN=https://cplus.talkincode.net CSP_E2E_LESSONS=s5-08 bun run e2e:typed
CSP_E2E_ORIGIN=https://cplus.talkincode.net CSP_E2E_LESSONS=s5-07,s5-08 bun run e2e:flow
```

## 文档

- [`docs/roadmap.md`](./docs/roadmap.md)：项目画像、边界、方向与业务能力验收矩阵
- [`docs/feature-checklist.md`](./docs/feature-checklist.md)：功能清单与交付状态
- [`docs/course-plan.md`](./docs/course-plan.md)：40 节视频课件的内容规划
- [`tests/e2e/manual-checklist.md`](./tests/e2e/manual-checklist.md)：无依赖的手工端到端验收脚本
- [`AGENTS.md`](./AGENTS.md)：内容、交互和验收规约

## 质量与验收

所有一级用户能力都必须遵守 [`docs/roadmap.md#验收矩阵业务能力覆盖矩阵`](./docs/roadmap.md#验收矩阵业务能力覆盖矩阵) 中的覆盖底线：新增能力要同步更新矩阵并提供 Happy Path 验证；涉及状态或权限时，还必须验证失败路径及恢复行为。

课程内容结构可通过下列命令校验，无需安装依赖：

```bash
bun test
```

除逐课用例之外，[`tests/lesson-contract.test.ts`](./tests/lesson-contract.test.ts) 会从 `index.html` 的 `courseData` 派生全部 40 节课，逐课校验互动页与随机小测的共同契约：题库来源与难度档位（必会 / 建议掌握 / 拓展）、选择题严格多于非选择题、题目字段与空题库提示、已通过校验的标记、词条双向接线、本地进度键，以及“无视频资产、不在浏览器里运行 C++”边界。新增课节会自动落入校验范围。

共享词条面板的失败与恢复契约由 [`tests/faq-panel-recovery.test.ts`](./tests/faq-panel-recovery.test.ts) 覆盖：词条表载入失败（含 HTTP 错误）必须当场说明、给出重新载入入口、向辅助技术播报，且不中断课件其他互动；重新载入成功后回到学习者刚才点开的词条。这条契约由全部 40 节课共用。

浏览器体验验收可以用真实浏览器自动重跑，同样不需要安装依赖（需要本机有 Chrome）：

```bash
bun run e2e:s1-01
```

脚本会自行启动开发服务器与无头 Chrome，按 [`tests/e2e/s1-01-manual-checklist.md`](./tests/e2e/s1-01-manual-checklist.md) 的八个场景完成 88 项检查（含跳过步骤、错误选项、刷新恢复、存储不可用与会话中途保存失败后的重试、词条表载入失败与重新载入、词条面板脚本根本未载入时的说明、小测检查目标绑定本课学习目标，以及题库异常两条失败路径），结束后清理自己启动的进程。它不属于 `bun test`：断言依赖真实浏览器渲染。

手写填空微练习同样可以用真实浏览器自动重跑：

```bash
bun run e2e:s1-typed   # S1-02 至 S1-08 七课，115 项检查
bun run e2e:s2-typed   # S2-01 至 S2-08 八课，136 项检查
bun run e2e:s3-typed   # S3-01 至 S3-08 八课，136 项检查
bun run e2e:s4-typed   # S4-01 至 S4-08 八课，136 项检查
bun run e2e:s5-typed   # S5-01 至 S5-08 八课，136 项检查
bun run e2e:typed      # 一次跑完上面全部 39 课，659 项检查
```

脚本按同一套样板逐课复验（每课 16 至 17 项）：脚手架只留一空、任务未走完不出现输入框、逐字符真实键盘输入会写进草稿，以及空提交、全角符号、语义写错三类失败路径都有具体指正且不算完成；提示、参考代码、重置等兜底可用；刷新后草稿与完成状态恢复；输入内容原样保留、不会被当成 HTML 或正确答案；抽到的题把检查目标绑到本课学习目标原文，并另起一行给出本题检查。各课出现输入框的条件不同，脚本会先走完各自的前置步骤：S1-02 要先把三个量的类型选对并走完「存文件 → 编译 → 运行」，S1-03 至 S1-07 要把前置公式选对（S1-05 还多三步提问演示与两处条件选择），S1-08 与 S2 之后的课要先把三类定位选完。

整课推进（从 `0 / N 已推进` 走到 `N / N`，外加小测本身）另有 `bun run e2e:flow`：

```bash
bun run e2e:flow       # S1-02 至 S5-08 全部 39 课，741 项检查（每课 19 项）
bun run e2e:flow:s3    # 只跑第三阶段八课
CSP_E2E_LESSONS=s3-07 bun tests/e2e/flow-cdp.ts   # 只跑一课
```

走完 `N / N` 之后，脚本还会确认页面自己把「继续学习」入口打开：写明下一课是 `Sx-xx` 与课名、先练的那件事，
链接直达下一课的 `index.html` 且真的可达（用 `HEAD` 请求验过），并且入口在没做完之前是隐藏的，不会把学习者
中途引走。S5-08 是最后一课，入口改成课程收尾：说明五阶段 40 课已走完、建议怎么复盘、题目与解析仍待人工
审校，并指回课程路线，不给成绩评定或能力认证的说法。

它验的是「这节课整段路走得通不通」：跳步会被拦住并说明要先完成前一个任务、每一步都经过真实浏览器点击、完成时给出与本节目标对应的完成文案、刷新后进度仍在、清掉本地存储就回到起点；趁小测面板可见时再量一遍「每题把检查目标绑到本课学习目标原文并另起一行给出本题检查、一次抽出的三题互不重复且都是选择题、没答完不能提交、提交后才给解析与得分、没考住时按学习目标汇总错题并指回本节讲解且不倒退进度」。它与 `e2e:typed` 共用 [`tests/e2e/lesson-flows.ts`](./tests/e2e/lesson-flows.ts) 里的答案表，改一处两边同时生效；步骤与仍需人工确认的部分见 [`tests/e2e/flow-manual-checklist.md`](./tests/e2e/flow-manual-checklist.md)。

## 键盘可达与焦点可见复验

「不用鼠标也能走完，而且始终看得见焦点在哪」同样有自动化复验：`bun run e2e:keyboard` 在真实浏览器里对全部
40 课逐课发真实按键事件，328 项检查（结构检查每课 8 项 + S1-02 与 S3-01 的键盘深路径每课 4 项）。

结构检查每课八项：`Tab` 绕一圈每个停靠点都能看出焦点在哪、没有用正数 `tabindex` 打乱自然顺序、没有把原生
控件用 `tabindex="-1"` 移出 `Tab` 顺序、没有「看着能点、键盘够不到」的元素、音效开关 `Space` 能切换且
`aria-pressed` 与屏幕文案同步、词条 `Enter` 打开 / `Esc` 关闭并把焦点交还刚才那个词条、步进门闩够得到但
`Enter` 与 `Space` 都推不动且状态区说明原因、步进轨道每一步（含还锁着的）都在 `Tab` 顺序里。

键盘深路径每课四项：只用键盘走到微练习空位逐字符敲进去并按检查、每题按 `Space` 作答后焦点仍留在同一题组、
没答完时提交按钮是原生 `disabled` 而答满后键盘提交能拿到得分与逐题解析且焦点交给结果区、提交后不能重复提交
而「换一套题」仍够得到。

这条复验第一次跑就量出两处真实缺陷，而且都在全部 40 课里（由同一份样板生成）：一是作答后重画题面把焦点
丢回文档主体，二是提交成功时提交按钮变成 `disabled`，浏览器顺势移走焦点，于是在得分与逐题解析出现、学习者
最需要读它的一刻焦点反而回到了页面顶部。两处都已修好，并由 `bun test` 里的
[`tests/keyboard-access-contract.test.ts`](./tests/keyboard-access-contract.test.ts) 按 `courseData` 逐课锁住，
新加的课自动纳入检查。步骤与仍需人工确认的部分见
[`tests/e2e/keyboard-manual-checklist.md`](./tests/e2e/keyboard-manual-checklist.md)。

