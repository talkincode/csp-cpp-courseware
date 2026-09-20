# CSP C++ Courseware

面向零基础学习者、以 **CSP-J 入门到提高** 为验收目标的 C++ 交互式课程项目。项目将长期学习路线拆成 5 个递进阶段、40 节课程；每一课都包含学习目标、具体内容、检验清单和练习建议。

> 课程强调“先把程序写对，再把题目做对”。CSP-J 是明确边界；CSP-S/NOI 的内容只在最后一课说明衔接方向，不作为本项目的承诺范围。

## 当前课程原型

仓库根目录的 [`index.html`](./index.html) 是无需构建的课程路线原型。它当前提供：

- 五阶段课程路径与阶段切换；
- 40 节课件的学习目标、讲授内容、检验清单和练习建议；
- 本地保存的逐项学习进度，不收集账号或个人信息；浏览器拒绝保存时会明确说明，并可在恢复后重试补写；
- 适合外部录课制作时使用的“视频组织建议”和移动端阅读布局。

它目前用于确认课程规划；每节课自己的在线学习页与随机测验已在 `lessons/<课程-id>/` 中实现（内容处于 `awaiting-user-review`，尚待人工审校），视频始终由仓库外流程负责。后续交付范围与验收标准见 [`docs/roadmap.md`](./docs/roadmap.md)。

本地预览使用 Bun：

```bash
bun run dev
```

打开 <http://localhost:4173>。

## 课件目录

每节课都有自己的目录：`lessons/<小写课程-id>/`。全部 40 个目录及其 `lesson.json` 已由 Bun 脚手架建立；40 节互动课件与随机测验目前均已实现（内容 `awaiting-user-review`，视频始终为仓库外交付）：

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

启动 `bun run dev` 后，打开 <http://localhost:4173/lessons/s1-01/>、<http://localhost:4173/lessons/s1-02/>、<http://localhost:4173/lessons/s1-03/>、<http://localhost:4173/lessons/s1-04/>、<http://localhost:4173/lessons/s1-05/>、<http://localhost:4173/lessons/s1-06/>、<http://localhost:4173/lessons/s1-07/>、<http://localhost:4173/lessons/s1-08/>、<http://localhost:4173/lessons/s2-01/>、<http://localhost:4173/lessons/s2-02/>、<http://localhost:4173/lessons/s2-03/>、<http://localhost:4173/lessons/s2-04/>、<http://localhost:4173/lessons/s2-05/>、<http://localhost:4173/lessons/s2-06/>、<http://localhost:4173/lessons/s2-07/>、<http://localhost:4173/lessons/s2-08/>、<http://localhost:4173/lessons/s3-01/>、<http://localhost:4173/lessons/s3-02/>、<http://localhost:4173/lessons/s3-03/>、<http://localhost:4173/lessons/s3-04/>、<http://localhost:4173/lessons/s3-05/>、<http://localhost:4173/lessons/s3-06/> 、<http://localhost:4173/lessons/s3-07/> 、<http://localhost:4173/lessons/s3-08/> 、<http://localhost:4173/lessons/s4-01/> 、<http://localhost:4173/lessons/s4-02/> 、<http://localhost:4173/lessons/s4-03/> 、<http://localhost:4173/lessons/s4-04/> 、<http://localhost:4173/lessons/s4-05/> 、<http://localhost:4173/lessons/s4-06/> 、<http://localhost:4173/lessons/s4-07/> 、<http://localhost:4173/lessons/s4-08/> 、 <http://localhost:4173/lessons/s5-01/> 、<http://localhost:4173/lessons/s5-02/> 、<http://localhost:4173/lessons/s5-03/> 、<http://localhost:4173/lessons/s5-04/> 、<http://localhost:4173/lessons/s5-05/> 、<http://localhost:4173/lessons/s5-06/> 、<http://localhost:4173/lessons/s5-07/> 或 <http://localhost:4173/lessons/s5-08/>。全部 40 节课程目录均已实现互动学习页与随机测验，内容仍待人工审校。


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

除逐课用例之外，[`tests/lesson-contract.test.ts`](./tests/lesson-contract.test.ts) 会从 `index.html` 的 `courseData` 派生全部 40 节课，逐课校验互动页与随机小测的共同契约：题库来源与难度档位（必会 / 建议掌握 / 拓展）、选择题严格多于非选择题、题目字段与空题库提示、`awaiting-user-review` 标记、词条双向接线、本地进度键，以及“无视频资产、不在浏览器里运行 C++”边界。新增课节会自动落入校验范围。

共享词条面板的失败与恢复契约由 [`tests/faq-panel-recovery.test.ts`](./tests/faq-panel-recovery.test.ts) 覆盖：词条表载入失败（含 HTTP 错误）必须当场说明、给出重新载入入口、向辅助技术播报，且不中断课件其他互动；重新载入成功后回到学习者刚才点开的词条。这条契约由全部 40 节课共用。

浏览器体验验收可以用真实浏览器自动重跑，同样不需要安装依赖（需要本机有 Chrome）：

```bash
bun run e2e:s1-01
```

脚本会自行启动开发服务器与无头 Chrome，按 [`tests/e2e/s1-01-manual-checklist.md`](./tests/e2e/s1-01-manual-checklist.md) 的七个场景完成 81 项检查（含跳过步骤、错误选项、刷新恢复、存储不可用与会话中途保存失败后的重试、词条表载入失败与重新载入，以及题库异常两条失败路径），结束后清理自己启动的进程。它不属于 `bun test`：断言依赖真实浏览器渲染。
