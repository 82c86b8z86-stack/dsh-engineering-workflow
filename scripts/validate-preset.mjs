/**
 * Structural validation of the bundled preset, mirroring the health checks
 * dsh-agent-presets discovery runs (see @deepseek-ai/dsh-agent-presets):
 *
 * 1. `agent.cordis.yml` must parse as a top-level list of plugin rows; every
 *    row is a map with a string `name`; `group: true` rows recurse into
 *    their `config` list. (`!!js` expressions are accepted by the loader's
 *    dialect and are checked here as valid YAML only.)
 * 2. `preset.yml`, when present, carries only `name` / `description` /
 *    `order` of the right shapes.
 * 3. Every `skills/<id>/SKILL.md` must carry `name` and `description`
 *    frontmatter, and the directory id must equal the frontmatter name.
 * 4. A `NOTICE` file ships attribution.
 *
 * Run with `node scripts/validate-preset.mjs`; exits non-zero on failure.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { bundledPresetsRoot } from "../lib/index.js";

/**
 * The loader's YAML dialect accepts `!!js` expressions (entryListSchema);
 * register the tag as a pass-through scalar so shape checks parse what the
 * loader would accept.
 */
const JsExpression = new yaml.Type("tag:yaml.org,2002:js", {
  kind: "scalar",
  resolve: () => true,
  construct: (data) => data,
});
const LOADER_SCHEMA = yaml.DEFAULT_SCHEMA.extend([JsExpression]);

const presetRoot = join(bundledPresetsRoot(), "engineering-workflow");
const failures = [];

function fail(message) {
  failures.push(message);
}

// ── 1. composition shape ────────────────────────────────────────────────────
const compositionPath = join(presetRoot, "agent.cordis.yml");
if (!existsSync(compositionPath)) {
  fail("agent.cordis.yml is missing — the preset would be reported broken");
} else {
  let rows;
  try {
    rows = yaml.load(readFileSync(compositionPath, "utf8"), { schema: LOADER_SCHEMA });
  } catch (error) {
    fail(`agent.cordis.yml is not valid YAML: ${String(error.message ?? error).split("\n")[0]}`);
    rows = void 0;
  }
  if (rows !== void 0) {
    if (!Array.isArray(rows)) fail("the composition must be a top-level list of plugin rows");
    else {
      const walk = (list, at) => {
        for (const [index, row] of list.entries()) {
          const label = `${at}row ${index + 1}`;
          if (typeof row !== "object" || row === null || Array.isArray(row)) {
            fail(`${label} is not a plugin row (expected a map with a "name")`);
            continue;
          }
          if (typeof row.name !== "string" || row.name === "") fail(`${label} names no plugin (a "name" string is required)`);
          if (row.group === true) {
            if (!Array.isArray(row.config)) fail(`${label} is a group but its config is not a list`);
            else walk(row.config, `${label} > `);
          }
        }
      };
      walk(rows, "");
      // The workflow's own invariant: skills must be wired to this preset's dir.
      const skillRow = rows.find((r) => r.id === "skill-filesystem");
      if (!skillRow) fail("composition is missing the skill-filesystem row that wires the workflow skills");
      const hasToolSkill = rows.some((r) => r.id === "tool-skill");
      if (!hasToolSkill) fail("composition is missing the tool-skill row — skills would be unloadable");
      const hasPlanning = rows.some((r) => r.id === "planning");
      if (!hasPlanning) fail("composition is missing the plan-mode group — the approval gate would be gone");
      const hasDelegation = rows.some((r) => r.id === "delegation");
      if (!hasDelegation) fail("composition is missing the delegation group — subagent execution would be gone");
    }
  }
}

// ── 2. metadata shape ───────────────────────────────────────────────────────
const metadataPath = join(presetRoot, "preset.yml");
if (!existsSync(metadataPath)) fail("preset.yml is missing — the preset would show no name");
else {
  const parsed = yaml.load(readFileSync(metadataPath, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) fail("preset.yml must be a map");
  else {
    for (const key of Object.keys(parsed)) if (!["name", "description", "order"].includes(key)) fail(`preset.yml carries unknown key ${key}`);
    if (typeof parsed.name !== "string" || parsed.name.trim() === "") fail("preset.yml needs a non-empty name");
    if (parsed.order !== void 0 && (typeof parsed.order !== "number" || !Number.isFinite(parsed.order))) fail("preset.yml order must be a number");
  }
}

// ── 3. skills ───────────────────────────────────────────────────────────────
const skillsRoot = join(presetRoot, "skills");
if (!existsSync(skillsRoot)) fail("skills/ directory is missing");
else {
  const ids = readdirSync(skillsRoot).filter((n) => !n.startsWith("."));
  for (const id of ids) {
    const skillFile = join(skillsRoot, id, "SKILL.md");
    if (!existsSync(skillFile)) {
      fail(`skill ${id}: SKILL.md missing`);
      continue;
    }
    const text = readFileSync(skillFile, "utf8");
    const match = text.match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) {
      fail(`skill ${id}: no frontmatter`);
      continue;
    }
    let fm;
    try {
      fm = yaml.load(match[1]);
    } catch (error) {
      fail(`skill ${id}: bad frontmatter YAML — ${String(error.message ?? error).split("\n")[0]}`);
      continue;
    }
    if (typeof fm?.name !== "string" || fm.name === "") fail(`skill ${id}: frontmatter needs a name`);
    else if (fm.name !== id) fail(`skill ${id}: frontmatter name ${fm.name} must equal directory id`);
    if (typeof fm?.description !== "string" || fm.description.trim() === "") fail(`skill ${id}: frontmatter needs a description`);
  }
  if (!ids.includes("engineering-workflow")) fail("the master skill engineering-workflow is missing");
}

// ── 4. attribution ──────────────────────────────────────────────────────────
if (!existsSync(join(presetRoot, "NOTICE"))) fail("NOTICE is missing — shipped adaptations require attribution");

// ── report ──────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  for (const f of failures) console.error(`✗ ${f}`);
  console.error(`preset validation failed with ${failures.length} problem(s)`);
  process.exit(1);
}
console.log("✓ preset structure valid: composition, metadata, skills and attribution all load");
