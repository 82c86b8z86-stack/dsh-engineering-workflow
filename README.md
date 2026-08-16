# dsh-engineering-workflow

An engineering workflow layer for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh). One install adds the **工程工作流 (Engineering Workflow)** agent preset — a disciplined-engineer mode with five hard-gated phases — plus six workflow skills that carry the methodology.

The workflow methodology is adapted from [obra/superpowers](https://github.com/obra/superpowers) (MIT): brainstorming, writing-plans, TDD, subagent-driven development, and verification-before-completion, reworked for dsh's native tools (plan mode + `exit_plan_mode`, background `subagent`/`subagent_fork`, `workflow` orchestration, goals, and the preset/skill system).

## The five phases

| Phase | Skill | Gate | dsh mechanism |
| --- | --- | --- | --- |
| ① Requirements clarification | `workflow-requirements` | Intent approved before any code | `ask_user_question`, one question at a time |
| ② Plan approval | `workflow-planning` | Plan approved via `exit_plan_mode` | plan mode, `todo_write` after approval |
| ③ TDD implementation | `workflow-tdd` | Failing test before production code | `pwsh`/`bash` test runs |
| ④ Parallel subagent execution | `workflow-subagents` | Per-task review + ledger | background `subagent`, `send_message`, `list_agents` |
| ⑤ Verified finishing | `workflow-verification` | Fresh evidence before claims | full suite + branch-finish menu |

The master skill `engineering-workflow` routes every non-trivial task to the right phase and enforces the discipline rules (rationalization red flags included).

## Install

```sh
dsh plugin --profile <name> add github:82c86b8z86-stack/dsh-engineering-workflow
```

(Or `npm install` the package into your profile and add `dsh-engineering-workflow` to `dsh.profile.bundles`.)

Restart dsh once so the host plugin mounts. On startup it syncs the preset into `~/.dsh/.agent-presets/engineering-workflow`; the preset then appears in the new-session preset picker as **工程工作流**. The sync is idempotent — upgrading the plugin updates the preset and its skills automatically.

Manual / development fallback without a restart:

```sh
node scripts/sync-presets.mjs
```

dsh re-discovers presets on every roster read, so the synced preset is selectable immediately.

## How it works

```
dsh-engineering-workflow (bundle)
├── cordis.patch.yml        inserts one host plugin row
└── lib/index.js            host plugin: syncs presets/ → ~/.dsh/.agent-presets,
│                           announces the workflow via a system-prompt section
└── presets/engineering-workflow/
    ├── agent.cordis.yml    full toolset composition (adapted from the shipped
    │                       cordis preset, MIT): shell, filesystem, jobs, goals,
    │                       plan mode, compaction, delegation (subagent/subagent_fork/
    │                       workflow/ralph), ask-user, todo, web, skills
    ├── preset.yml          roster metadata (name / description / order)
    ├── skills/             6 workflow skills (one SKILL.md per directory)
    └── NOTICE              attribution
```

The preset wires its skills through `@deepseek-ai/dsh-skill-filesystem` with `customSkillDirs` rooted at the preset's own directory — the same pattern the shipped `cordis` preset uses, so the skill catalog travels with the preset wherever it is installed.

## Development

```sh
pnpm install
pnpm test          # preset-sync unit tests
pnpm run validate  # structural validation of the bundled preset
pnpm run sync      # sync the preset into ~/.dsh/.agent-presets
```

## License

MIT. The preset composition is adapted from the DeepSeek Harness built-in `cordis` preset (MIT); the workflow methodology is adapted from obra/superpowers (MIT); the preset-sync host-plugin pattern follows `@linxin666/dsh-liangshen` (Apache-2.0). See `presets/engineering-workflow/NOTICE`.
