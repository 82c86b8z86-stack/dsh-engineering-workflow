---
name: workflow-subagents
description: 子 Agent 并行执行：按任务派发全新后台 subagent、逐任务审查、修复循环、账本记录与全分支终审；独立任务并行派发。Use when executing implementation plans with independent tasks, or facing 2+ independent tasks that can run concurrently without shared state.
---

# 子 Agent 并行执行（Workflow Subagents）

每个任务派发一个**全新** implementer subagent（隔离上下文，绝不继承你的会话历史），完成后派发 reviewer 审查，修复循环兜底；任务之间连续执行，不在中途向用户逐任务请示。

**核心原则**：全新 subagent 每任务 + 逐任务审查（规格符合 + 质量）+ 终审 = 高质量、快迭代。

**为什么用 subagent**：你委派的是带隔离上下文的专注 agent；你精确构造它所需的全部信息，它不继承你会话的上下文与历史——这同时保住你自己的上下文用于协调。

## DSH 工具映射

| 动作 | DSH 工具 |
| --- | --- |
| 派发 implementer / reviewer | `subagent`（spawn：全新上下文，`run_in_background` 默认 true，返回持久 subagent_id） |
| 继承会话上下文的跟进 | `subagent_fork`（适合「基于上面结果继续」的审查/分析） |
| 修复循环继续同一个 agent | `send_message`（向其 subagent_id 发下一条消息，保留其上下文） |
| 找回派发清单 / 状态 | `list_agents`（不用于轮询完成——完成时会收到通知） |
| 取消跑偏的任务 | `interrupt_agent` |
| 大规模同构 fan-out | `workflow` 工具（JS 编排脚本 + 结构化结果） |
| 收集后台结果 | 完成通知自动到达；`job_output` 收集 pwsh 后台任务输出 |

## 何时用哪种模式

```
有实施计划？
 ├─ 否 → 回 workflow-planning / workflow-requirements
 └─ 是 → 任务大多独立？
       ├─ 是 → 子 Agent 驱动（本技能主流程）
       └─ 否（紧耦合）→ 内联执行（workflow-planning 的执行规则）
```

**并行派发模式**（独立调查/修复域）：2+ 个互不依赖、无共享状态的问题域——多个 `subagent` 调用放在**同一条消息**里 = 并行运行；一条消息一个 = 顺序执行。规则：
- 一个 agent 一个问题域；提示要聚焦（具体文件/测试）、自包含（全部上下文）、明确输出（返回什么）。
- 共享文件/共享状态 = 不并行；会互相踩的改动顺序做。
- 返回后：逐个读摘要 → 检查冲突（是否改了同一代码）→ 跑全量套件 → 集成。

## 主流程（每任务循环）

### 0. 设置

- 不在 main/master 上实现（除非用户明确同意）；建议分支或独立工作区。
- 账本：`.workflow/ledger.md`，第一行 `# workflow ledger — plan: <plan path>`。**对话记忆活不过压缩；账本 + git log 才是恢复地图。**压缩后相信账本与 `git log`，别信回忆。
- 读一遍计划，记下 Global Constraints；spec 是绑定权威，计划是其论证。
- `todo_write` 每任务一项。
- **预检扫描**：派发 Task 1 前扫一遍计划内冲突（任务互相矛盾/与 Global Constraints 矛盾/计划强制要求但审查标准视为缺陷的内容），写成表格写入账本，每条给出裁定（Ruling）或标注「干净」。

### 1. 派发 implementer

- 记录 `BASE`（`git rev-parse HEAD`）——审查包与修复轮 diff 需要它。
- **任务简报文件**：用 `write` 把该任务全文提取到 `.workflow/task-N-brief.md`（唯一源需求文件）；派发提示包含：(1) 一行任务在项目中的位置；(2) 简报路径，注明「先读这个——它是你的需求，数值原文照抄」；(3) 之前任务的接口与裁定（简报里没有的）；(4) 你注意到的歧义的裁决；(5) 报告文件路径与报告契约。精确值（数字、魔法串、签名、用例）只出现在简报里。**永远不要让 subagent 读整份计划。**
- **报告文件**：`.workflow/task-N-report.md`，implementer 写全量报告，只返回：状态、提交、一行测试摘要、顾虑。
- 派发提示只描述一个任务，不贴会话历史，不带「前 N 个任务状态」。
- **契约：implementer 不派发 subagent**——不派帮手，更不派审查者；审查只从你这里来。
- 记录返回的 subagent_id（修复轮 1-3 用它）。
- 同形小任务（同一类一行改动 × N 个文件）合并成**一批**一个派发，review 其 diff 作为一个单元。

### 2. 处理报告（四种状态）

- **DONE** → 生成审查包（`git log --oneline BASE..HEAD`、`git diff --stat`、`git diff -U10 BASE..HEAD` 重定向到 `.workflow/task-N-diff.txt`——diff 永不进你自己的上下文），派发 reviewer。
- **DONE_WITH_CONCERNS** → 先读顾虑；关于正确性/范围就先处理再审查；纯观察就记录并继续审查。
- **NEEDS_CONTEXT** → 补上下文重新派发。
- **BLOCKED** → 评估阻塞：上下文问题 → 补上下文重派；需要更强推理 → 换思路重派（改提示，别原样重试）；任务过大 → 拆分；计划本身错 → 裁定 + 记入账本 + 带裁定重派。**永远不要忽略升级信号、不要无变化重试。**

implementer 中途提问 → 清楚完整地回答，别催。

### 3. 审查任务（逐任务门禁）

- reviewer 输入三条路径：简报文件、报告文件、diff 文件 + Global Constraints（逐字复制，作为其注意力透镜）。不加大而无当的指示；不要求它重跑 implementer 已跑过的测试；**不预判发现**（提示里出现「不要标 X」「最多 Minor」= 你在预判，重写）。
- 两个裁决缺一不可：**规格符合** 与 **质量**。implementer 自审不能替代任务审查。
- reviewer 报「⚠️ 无法从 diff 验证」的项：你自己逐项解决（你有计划与跨任务上下文）；确认是真缺口 = 按审查失败处理，进入修复循环。
- Minor 发现记入账本（`Task N: minor (deferred): <一句话>`），不进循环，留给终审分诊。

### 4. 修复循环（每任务最多 5 轮）

触发：规格 ❌、任何 Critical/Important 发现、或你确认的 ⚠️ 缺口。修复轮 = 一次修复派发 + 一次范围限定复审。

- **轮 1-3：`send_message` 恢复原 implementer**，原文贴未决发现。若平台不支持给活 agent 发消息，用简报 + 报告 + 发现清单重新派发。
- **轮 4-5：全新 implementer**（更清晰提示），带简报、报告文件、未决发现，并说明「前一位尝试了 N 次；现在你接手。读报告文件了解试过什么」。
- 每轮：修复 → 重跑覆盖测试 → 把修复报告**追加**到同一报告文件 → 复审。确认报告含覆盖测试、命令、输出三者齐全后才派复审；修复消息中点名覆盖测试文件。
- **复审是范围限定的**：`git diff -U10 FIX_BASE..HEAD`（FIX_BASE = 上一轮复审看到的 HEAD）。复审逐条裁决 ADDRESSED / NOT ADDRESSED，只标修复 diff 里的新破坏；范围外观测进账本，不延长循环。
- 每轮后记账：`Task N: fix round R/5 (X addressed, Y open — <发现一句话>; commits a7..b7)`。
- **绝不在主会话自己改代码**——控制器改动绕过审查、污染上下文。
- **熔断（第 5 轮仍开）**：停止派发，逐条裁决：(a) 审查者错/可争 → 记 `parked — 裁定`；(b) 真实但下游不依赖 → 同样 park 并注明真实且延期；(c) 真实且承重（后续任务依赖/暴露计划缺陷）→ 裁最小解堵改动，记入账本并带入下一任务派发；只有每条路都靠猜时才停下问人。**只在封顶时裁决**；每次裁决必须入账本，静默丢弃禁止。

### 5. 完成任务

审查干净（或封顶后全部裁决）→ 同一消息里记账：
- `Task N: complete (commits <base7>..<head7>, review clean)`
- 或 `Task N: complete (commits <base7>..<head7>, K parked)`

然后 todo 标记完成，继续下一任务。审查仍有未决 Critical/Important 且既未修复也未 park 时不得前进。

## 终审

- 全部任务完成后：`git diff -U10 $(git merge-base main HEAD)..HEAD > .workflow/final-diff.txt`，派发终审 reviewer（最强可用，全新 spawn），并把账本里的 deferred-minor 与 parked 行指给它分诊。
- 终审有发现 → **一次**修复派发（全部发现清单，一个 fixer——每个发现一个 fixer 的代价曾超过全部任务之和）→ 一次范围限定复审 → 残余裁决同上。没有第二波修复；残余承重发现留给 `workflow-verification` 的收尾菜单呈现给用户。

## 等待与节奏

- **不忙轮询**：subagent 完成时你会收到通知，用 `list_agents` 对账而非轮询。
- 等待期间做本地工作（账本、打包下一审查、读报告）。
- 任务之间不向用户「我应该继续吗」——已批准的计划就是继续的理由。四类停止条件：不可逆/破坏性操作；安全敏感动作；工作区外副作用（合并/推共享分支/发布）；计划烂到每条路都靠猜。
- 冲突/歧义/计划缺陷 → **裁定并继续**（Ruling: 决定 — 理由 — 错了的代价），账本记录；收尾时把全部 Ruling 汇总进最终报告。

## 终了

删除工作区前，把账本里每一条 `Ruling:`（预检、park、熔断裁决）收集进最终消息的「Rulings I made」，按序、每条带错误代价。这份清单是你替用户做的决定的唯一出口。

## 红线

| 念头 | 事实 |
| --- | --- |
| 「差一点，规格差不多就行」 | 审查发现规格缺口 = 没完成。修，或封顶裁决——只有这两个出口。 |
| 「我自己改得了，派发是开销」 | 控制器改动污染上下文且绕过审查。恢复 implementer。 |
| 「审查会拖慢循环」 | 没有审查的循环只是未验证的折腾。 |
| 「账本记账是开销」 | 账本是压缩后唯一幸存物；没账本的控制器曾整段重派已完成任务。 |
| 「agent 说成功了」 | 独立核验：看 diff、看测试输出（workflow-verification 铁律）。 |
| 「这发现明显错，我丢了它」 | 只在封顶时裁决，且每条裁决入账本；静默丢弃禁止。 |
| 「几个任务一起派，省时间」 | 会互相踩的改动并行 = 冲突与返工；只有无共享状态的域才并行。 |
