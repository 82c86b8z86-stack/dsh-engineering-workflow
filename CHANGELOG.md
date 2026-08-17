# Changelog

## 0.1.1 (2026-08-17)

Maintenance release.

- Install verification: `verifyPresetTrees()` in `lib/index.js` plus the `scripts/verify-install.mjs` CLI — byte-compares the bundled preset against `~/.dsh/.agent-presets` without writing, so an install can be checked in one command.
- READMEs: added a troubleshooting section covering where the preset appears in the GUI and how to verify the install.

## 0.1.0 (2026-08-16)

Initial release.

- Host plugin with idempotent preset sync into `~/.dsh/.agent-presets` and a system-prompt announcement (`lib/index.js`, `cordis.patch.yml`).
- `engineering-workflow` agent preset: full standard toolset (plan mode, delegation, goals, jobs, skills) with a disciplined-engineer persona (`presets/engineering-workflow/agent.cordis.yml`).
- Six workflow skills, adapted from obra/superpowers for dsh:
  - `engineering-workflow` — master skill and phase router
  - `workflow-requirements` — requirements clarification with approval gate
  - `workflow-planning` — plan writing and approval via plan mode
  - `workflow-tdd` — test-driven implementation
  - `workflow-subagents` — parallel subagent execution with ledger and review
  - `workflow-verification` — evidence-before-claims finishing
- Unit tests for the sync machinery (`test/sync.test.mjs`) and a structural preset validator (`scripts/validate-preset.mjs`).
