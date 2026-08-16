/**
 * Manual preset sync CLI: `node scripts/sync-presets.mjs`.
 *
 * Runs the same sync the host plugin performs on startup, without needing a
 * dsh process or a restart — useful for local development and CI checks.
 * Presets are copied into $DSH_HOME/.agent-presets (default ~/.dsh/.agent-presets);
 * dsh re-discovers presets on every roster read, so a synced preset is
 * selectable for new sessions immediately.
 */
import { syncPresetTrees, bundledPresetsRoot, dshHome } from "../lib/index.js";
import { join } from "node:path";

const targetRoot = process.argv[2] ?? join(dshHome(), ".agent-presets");
const result = syncPresetTrees(bundledPresetsRoot(), targetRoot, []);
console.log(`dsh-engineering-workflow: synced into ${targetRoot}`);
console.log(`  synced:  ${result.synced.join(", ") || "(none)"}`);
console.log(`  current: ${result.current.join(", ") || "(none)"}`);
console.log(`  retired: ${result.retired.join(", ") || "(none)"}`);
for (const { id, error } of result.failed) console.error(`  FAILED ${id}: ${error}`);
if (result.failed.length > 0) process.exitCode = 1;
