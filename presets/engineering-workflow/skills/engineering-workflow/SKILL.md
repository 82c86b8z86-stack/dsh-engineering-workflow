---
name: engineering-workflow
description: 工程化工作流总纲：五阶段硬门禁（需求澄清 → 计划审批 → TDD 实现 → 子 Agent 并行执行 → 验证收尾），任务路由、产物约定与纪律规则。Use when starting any non-trivial task — every feature, bugfix, refactor, or multi-step change must first be routed through this workflow.
---

# 工程化工作流总纲（Engineering Workflow Master）

本技能是 dsh 纪律工程师工作流层的入口。任何非平凡任务（新功能、缺陷修复、重构、多步骤变更）在动手之前，先按本技能完成阶段路由；被路由到的阶段技能必须在对应阶段**开始前**通过 `skill` 工具加载并遵循。

## 铁律

```
未经批准的意图 → 不写代码。
未经批准的计划 → 不执行任务。
没有失败测试 → 不写生产代码。
未经核实的证据 → 不宣称完成。
```

违反任一条的铁律的字面，就是违反其精神。

## 五个阶段与路由

| 阶段 | 技能 | 门禁（gate） | 产物 |
| --- | --- | --- | --- |
| ① 需求澄清 | `workflow-requirements` | 意图获得用户明确批准后才可动手 | 设计文档（架构级）或聊天内短设计（有界级） |
| ② 计划审批 | `workflow-planning` | 计划经 `exit_plan_mode` 呈现并获批准 | `docs/plans/YYYY-MM-DD-<feature>.md` |
| ③ TDD 实现 | `workflow-tdd` | 每个行为先有失败测试 | 测试 + 最小实现，小步提交 |
| ④ 子 Agent 并行执行 | `workflow-subagents` | 每任务审查通过，账本记录 | 账本 `.workflow/ledger.md`、审查报告 |
| ⑤ 验证收尾 | `workflow-verification` | 全部验证命令重新运行并有输出证据 | 绿套件 + 分支收尾决策 |

路由规则：

- 「帮我做个 X / 加个功能 / 改一下行为」→ ① 需求澄清（若已有明确规格或设计文档则跳到 ②）。
- 「修这个 bug」→ ① 轻量澄清 → ③ TDD（先写复现测试），不跳 ③。
- 已有批准的设计文档 → ② 计划审批。
- 已有批准的实施计划 → ③ 或 ④ 直接执行。
- 多步骤任务执行中 → 阶段技能按序流转，回退需明确说出口。

## 何时用哪个执行模式（④ 内部再路由）

| 场景 | 模式 |
| --- | --- |
| 计划任务大部分互相独立、需要持续审查 | `workflow-subagents`（每任务一个后台 subagent + 审查） |
| 2+ 个完全独立的调查/修复域，无共享状态 | `workflow-subagents` 的并行派发模式 |
| 任务紧耦合、共享上下文过多 | 本会话内联执行（`workflow-tdd` + `todo_write` 跟踪） |
| 大规模同构任务（几十个文件同类改动） | `workflow` 工具编排脚本 |

## 通用纪律

1. **先加载技能再行动**：进入某阶段前先 `skill(<阶段技能>)`，包括提澄清问题之前。宣布「Using <技能名> to <目的>」。
2. **一次一个问题**：需求澄清用 `ask_user_question` 一次只问一个问题（见 `workflow-requirements`）。
3. **计划即合同**：批准后的计划是执行依据；执行中偏离需记录「裁定（Ruling）」并继续，只有四类情况停下询问（不可逆/破坏性操作、安全敏感动作、工作区外的副作用、计划烂到每步都靠猜）。
4. **账本胜过记忆**：多任务执行把进度写进账本文件（`.workflow/ledger.md`），因为会话压缩会丢失对话记忆。
5. **小步提交**：每个任务的提交独立、可审查（TDD 节奏：RED 提交测试、GREEN 提交实现，或至少每任务一提交）。
6. **YAGNI 无情**：任何设计/计划先砍掉不必要的功能。

## 红线（Rationalization Red Flags）

| 念头 | 事实 |
| --- | --- |
| 「这个太简单了，不用澄清」 | 简单意味着更短的设计，而不是没有设计；批准门禁从不随简单而消失。 |
| 「我先看一下代码再决定」 | 技能检查先于探索。先路由，再按技能规定的方式探索。 |
| 「计划我口头说一下就行」 | plan mode 下计划只通过 `exit_plan_mode` 呈现，口头同意不结束 plan mode。 |
| 「这个测试先跳过，回头补」 | 跳过 TDD 的代码 = 重写。没有例外。 |
| 「子 agent 说成功了」 | 独立核验 diff 与测试输出（见 `workflow-verification`）。 |
| 「之前跑过测试了」 | 证据只在本次运行该命令后有效。重新跑，读输出。 |
| 「我应该继续吗？」 | 已批准的计划不需要逐任务请示；按计划执行，只在四类停止条件停下。 |

## 本工作流在 DSH 中的工具映射

- 需求澄清：`ask_user_question`（一次一个问题，可带选项）。
- 计划审批：plan mode + `exit_plan_mode`；批准后 `todo_write` 建任务清单。
- TDD：`pwsh`（Windows）/ `bash` 运行测试，`read`/`grep`/`edit`/`write` 改代码。
- 并行执行：`subagent`（默认 `run_in_background: true`）、`subagent_fork`、`send_message`、`list_agents`、`interrupt_agent`、`job_output`；大 fan-out 用 `workflow`。
- 长线目标：`create_goal` / `update_goal` 跟踪会话级完成目标。
- 验证收尾：`pwsh` 跑全量验证 + git 命令；分支收尾决策交还给用户。
