/**
 * dsh-engineering-workflow — engineering workflow layer for DeepSeek Harness.
 *
 * Host half only: on startup it syncs the bundled `presets/` tree into the
 * harness-home agent-presets root (`~/.dsh/.agent-presets`), making the
 * engineering-workflow preset (composition + skills) selectable for new
 * sessions without copying files by hand, and announces the workflow through
 * a system-prompt section. No browser half, no routes, no agent tools — the
 * preset itself provides the tools and the skills provide the methodology.
 *
 * The five workflow phases shipped as skills:
 *   engineering-workflow   — master skill, routes tasks to phases
 *   workflow-requirements  — requirements clarification (classify → questions → approval)
 *   workflow-planning      — plan writing and approval (plan mode + exit_plan_mode)
 *   workflow-tdd           — test-driven implementation (red-green-refactor)
 *   workflow-subagents     — parallel subagent execution (dispatch, ledger, review)
 *   workflow-verification  — verified finishing (evidence before claims, branch menu)
 *
 * The preset-sync pattern (per-directory idempotent copy with byte-compare
 * and pruning) follows the approach used by @linxin666/dsh-liangshen (MIT);
 * the workflow methodology is adapted from obra/superpowers (MIT).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import z from "schemastery";

/** Stable cordis plugin name. */
export const name = "engineering-workflow";

/** Prompt assembly must exist before the announcement section can register. */
export const inject = ["systemPrompt"];

/** Plugin config: both switches default on. */
export const Config = z.object({
  enabled: z.boolean().default(true),
  announceToAgent: z.boolean().default(true),
});

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 160;

/**
 * Model-facing announcement: plugin presence, the five workflow phases, and
 * where the preset files live.
 */
export const WORKFLOW_GUIDANCE = "本机已安装 dsh-engineering-workflow 插件（工程化工作流）：新建会话的预设选择器中可选「工程工作流」。该预设为 dsh 叠加完整的纪律工程师工作流层，五个阶段硬门禁：① 需求澄清（workflow-requirements：先分类再提问，动手前必须获得明确批准）→ ② 计划审批（workflow-planning：plan mode 内通过 exit_plan_mode 提交计划并等待批准）→ ③ TDD 实现（workflow-tdd：没有失败测试就没有生产代码）→ ④ 子 Agent 并行执行（workflow-subagents：后台 subagent 派发 + 账本 + 逐任务审查）→ ⑤ 验证收尾（workflow-verification：证据先于断言，分支收尾菜单）。总纲 skill 为 engineering-workflow，非平凡任务开始时应先加载它。preset 与 skills 由插件维护于 ~/.dsh/.agent-presets/engineering-workflow，升级插件时自动更新；默认预设由用户自行选择。用户提到「工程工作流 / 纪律工程师 / engineering workflow / 五阶段工作流」时即指本插件，请据此协作。";

/** Expand a leading `~`, `~/` or `~\` to the current user's home directory. */
export function expandTilde(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
  return path;
}

/** Resolve the harness home (DSH_HOME overrides the conventional ~/.dsh). */
export function dshHome() {
  const override = process.env.DSH_HOME;
  if (override === void 0) return join(homedir(), ".dsh");
  const trimmed = override.trim();
  return trimmed === "" ? join(homedir(), ".dsh") : expandTilde(trimmed);
}

/** Absolute path of the bundled preset tree inside this package. */
export function bundledPresetsRoot() {
  return fileURLToPath(new URL("../presets/", import.meta.url));
}

function filesUnder(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(path);
    }
  };
  walk(root);
  return out;
}

/** Preset files are small; identity means identical bytes, not just size/mtime. */
function sameFile(a, b) {
  return readFileSync(a).equals(readFileSync(b));
}

/**
 * Remove files not in `keep` (relative paths), then remove only the
 * directories those removals left empty — still strictly inside `root`, so
 * sibling presets are never touched.
 */
function pruneExtras(root, keep) {
  const parents = new Set();
  for (const file of filesUnder(root)) if (!keep.has(relative(root, file))) {
    parents.add(dirname(file));
    rmSync(file, { force: true });
  }
  for (const start of parents) {
    let dir = start;
    while (dir !== void 0 && relative(root, dir) !== "") if (existsSync(dir) && readdirSync(dir).length === 0) {
      rmSync(dir, { recursive: true, force: true });
      dir = dirname(dir);
    } else dir = void 0;
  }
}

/** Copy `sourceRoot/<id>` into `targetRoot/<id>`, idempotently. Returns "synced" or "current". */
export function syncOnePreset(sourceDir, targetDir) {
  const sourceFiles = filesUnder(sourceDir);
  const sourceSet = new Set(sourceFiles.map((file) => relative(sourceDir, file)));
  if (existsSync(targetDir) && !statSync(targetDir).isDirectory()) rmSync(targetDir, { recursive: true, force: true });
  if (!existsSync(targetDir)) {
    cpSync(sourceDir, targetDir, { recursive: true, preserveTimestamps: true });
    pruneExtras(targetDir, sourceSet);
    return "synced";
  }
  let dirty = false;
  for (const file of sourceFiles) {
    const dest = join(targetDir, relative(sourceDir, file));
    if (!existsSync(dest) || !sameFile(file, dest)) {
      dirty = true;
      break;
    }
  }
  if (!dirty) {
    for (const file of filesUnder(targetDir)) if (!sourceSet.has(relative(targetDir, file))) {
      dirty = true;
      break;
    }
  }
  if (!dirty) return "current";
  pruneExtras(targetDir, sourceSet);
  cpSync(sourceDir, targetDir, { recursive: true, preserveTimestamps: true });
  pruneExtras(targetDir, sourceSet);
  return "synced";
}

/**
 * Sync every preset under `sourceRoot` into `targetRoot`, then remove
 * target directories named in `retire` that the bundle no longer ships.
 * Only those exact ids are removed; every other target directory is left
 * untouched.
 *
 * @param sourceRoot - plugin-owned preset tree (bundled in the package).
 * @param targetRoot - dsh agent-presets discovery root (e.g. <home>/.dsh/.agent-presets).
 * @param retire - previously bundled preset ids to remove when absent from the source.
 * @returns { synced: string[], current: string[], failed: {id,error}[], retired: string[] }
 */
export function syncPresetTrees(sourceRoot, targetRoot, retire = []) {
  const result = { synced: [], current: [], failed: [], retired: [] };
  mkdirSync(targetRoot, { recursive: true });
  if (existsSync(sourceRoot)) for (const entry of readdirSync(sourceRoot)) {
    const source = join(sourceRoot, entry);
    if (!statSync(source).isDirectory()) continue;
    const id = basename(source);
    try {
      (syncOnePreset(source, join(targetRoot, id)) === "synced" ? result.synced : result.current).push(id);
    } catch (error) {
      result.failed.push({ id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  for (const id of retire) {
    if (existsSync(join(sourceRoot, id))) continue;
    const stale = join(targetRoot, id);
    if (existsSync(stale) && statSync(stale).isDirectory()) {
      rmSync(stale, { recursive: true, force: true });
      result.retired.push(id);
    }
  }
  return result;
}

/**
 * Mount the plugin: sync bundled presets into the harness-home agent-presets
 * root, then announce through a system-prompt section.
 * @param ctx - host plugin context carrying systemPrompt.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx, config) {
  const resolve = () => ({
    enabled: config?.enabled ?? true,
    announceToAgent: config?.announceToAgent ?? true,
  });
  const sync = () => {
    const targetRoot = join(dshHome(), ".agent-presets");
    try {
      mkdirSync(targetRoot, { recursive: true });
      const result = syncPresetTrees(bundledPresetsRoot(), targetRoot, []);
      for (const { id, error } of result.failed) ctx.logger?.warn?.(`dsh-engineering-workflow: preset ${id} sync failed: ${error}`);
      if (result.synced.length > 0) ctx.logger?.info?.(`dsh-engineering-workflow: presets synced into ${targetRoot}: ${result.synced.join(", ")}`);
      if (result.retired.length > 0) ctx.logger?.info?.(`dsh-engineering-workflow: retired stale presets from ${targetRoot}: ${result.retired.join(", ")}`);
    } catch (error) {
      ctx.logger?.warn?.(`dsh-engineering-workflow: preset sync failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  let disposeSection;
  const refresh = () => {
    disposeSection?.();
    disposeSection = void 0;
    if (!resolve().enabled) return;
    sync();
    if (resolve().announceToAgent) disposeSection = ctx.systemPrompt.section({
      name: "plugin:dsh-engineering-workflow",
      order: SECTION_ORDER,
      text: WORKFLOW_GUIDANCE,
    });
  };
  refresh();
  ctx.effect(() => () => {
    disposeSection?.();
    disposeSection = void 0;
  }, "dsh-engineering-workflow: announcement");
}
