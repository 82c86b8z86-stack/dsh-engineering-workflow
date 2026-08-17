# dsh-engineering-workflow（工程工作流）

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）叠加完整的工程化工作流层。一次安装即获得「**工程工作流**」agent preset——带五阶段硬门禁的纪律工程师模式——以及承载方法论的 6 个工作流技能。

方法论改编自 [obra/superpowers](https://github.com/obra/superpowers)（MIT）的 brainstorming / writing-plans / TDD / subagent-driven-development / verification-before-completion，并针对 dsh 原生能力重写：plan mode + `exit_plan_mode`、后台 `subagent`/`subagent_fork`、`workflow` 编排、目标工具与 preset/skill 体系。

## 五个阶段

| 阶段 | 技能 | 门禁 | dsh 机制 |
| --- | --- | --- | --- |
| ① 需求澄清 | `workflow-requirements` | 意图获批后才动手 | `ask_user_question` 一次一问 |
| ② 计划审批 | `workflow-planning` | 计划经 `exit_plan_mode` 获批 | plan mode，批准后 `todo_write` |
| ③ TDD 实现 | `workflow-tdd` | 没有失败测试就没有生产代码 | `pwsh`/`bash` 跑测试 |
| ④ 子 Agent 并行执行 | `workflow-subagents` | 逐任务审查 + 账本 | 后台 `subagent`、`send_message`、`list_agents` |
| ⑤ 验证收尾 | `workflow-verification` | 证据先于断言 | 全量套件 + 分支收尾菜单 |

总纲技能 `engineering-workflow` 把每个非平凡任务路由到对应阶段，并强制执行纪律规则（含合理化红线表）。

## 安装

```sh
dsh plugin --profile <name> add github:82c86b8z86-stack/dsh-engineering-workflow
```

（或将本包安装进 profile 依赖，并把 `dsh-engineering-workflow` 加入 `dsh.profile.bundles`。）

重启一次 dsh 让宿主插件挂载。启动时插件把 preset 同步到 `~/.dsh/.agent-presets/engineering-workflow`，之后新建会话的预设选择器中即可选「工程工作流」。同步幂等——升级插件会自动更新 preset 与技能。

免重启的手动/开发回退：

```sh
node scripts/sync-presets.mjs
```

dsh 每次读取 roster 都会重新发现预设，同步后立即可选。

## 工作原理

```
dsh-engineering-workflow (bundle)
├── cordis.patch.yml        insert 一行宿主插件
└── lib/index.js            宿主插件：把 presets/ 同步进 ~/.dsh/.agent-presets，
│                           并经 system-prompt section 向模型公告工作流
└── presets/engineering-workflow/
    ├── agent.cordis.yml    完整工具集 composition（改编自内置 cordis preset，MIT）：
    │                       shell、文件、后台任务、目标、plan mode、压缩、委派
    │                       （subagent/subagent_fork/workflow/ralph）、ask-user、todo、web、skills
    ├── preset.yml          roster 元数据（名称/描述/排序）
    ├── skills/             6 个工作流技能（每目录一个 SKILL.md）
    └── NOTICE              署名声明
```

preset 通过 `@deepseek-ai/dsh-skill-filesystem` 的 `customSkillDirs`（以 preset 自身目录为根）接入技能——与内置 `cordis` preset 同款模式，技能目录随 preset 走到哪跟到哪。

## 验证安装

```sh
node scripts/verify-install.mjs
# ✓ engineering-workflow: current (byte-identical)
```

只读比对内置 preset 与 `~/.dsh/.agent-presets`，不做任何写入。若报告 `stale` 或 `missing`，执行 `node scripts/sync-presets.mjs`（或重启一次 dsh，让宿主插件在挂载时同步）。

插件生效的位置：

- **预设选择器**（新建会话对话框）中出现「工程工作流」——dsh 每次读取 roster 都会重新发现预设，同步后无需重启即可见。新建会话时选择它；已有会话与默认预设不会被自动切换。
- **system-prompt 公告**（模型读到的工作流指引）只出现在宿主插件挂载之后创建的会话里——即安装后第一次重启 dsh 之后。
- 6 个工作流技能随预设加载，可在这些会话里通过 `skill` 工具调用。

## 开发

```sh
pnpm install
pnpm test          # preset 同步单元测试
pnpm run validate  # 内置 preset 结构校验
pnpm run sync      # 同步 preset 到 ~/.dsh/.agent-presets
pnpm run verify    # 字节级比对内置 preset 与安装结果
```

## 许可

MIT。preset composition 改编自 DeepSeek Harness 内置 `cordis` preset（MIT）；工作流方法论改编自 obra/superpowers（MIT）；preset 同步宿主插件模式参考 `@linxin666/dsh-liangshen`（Apache-2.0）。详见 `presets/engineering-workflow/NOTICE`。
