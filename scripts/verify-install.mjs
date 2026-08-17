/**
 * Install verification CLI: `node scripts/verify-install.mjs`.
 *
 * Compares the bundled preset tree against the installed target
 * ($DSH_HOME/.agent-presets by default) WITHOUT writing anything, and
 * reports per preset whether the install is current, stale, or missing.
 * Exits 0 when every bundled preset is byte-identical with the target.
 *
 * Note: this verifies the FILES. Whether the running dsh process has picked
 * them up is a separate question — dsh re-discovers presets on every roster
 * read, so a synced preset is selectable immediately, while the host plugin's
 * system-prompt announcement appears in sessions created after the plugin
 * mounted (i.e. after a dsh restart following the install).
 */
import { verifyPresetTrees, bundledPresetsRoot, dshHome } from "../lib/index.js";
import { join } from "node:path";

const targetRoot = process.argv[2] ?? join(dshHome(), ".agent-presets");
const report = verifyPresetTrees(bundledPresetsRoot(), targetRoot);
let failed = false;
for (const row of report) {
  if (row.status === "ok") console.log(`✓ ${row.id}: current (byte-identical)`);
  else {
    failed = true;
    if (row.status === "missing") console.error(`✗ ${row.id}: missing — not installed at ${targetRoot}`);
    else {
      console.error(`✗ ${row.id}: stale`);
      for (const file of row.differing ?? []) console.error(`    differs: ${file}`);
      for (const file of row.extra ?? []) console.error(`    extra:   ${file}`);
    }
  }
}
if (report.length === 0) {
  console.error("✗ no bundled presets found — the package ships no presets/ tree");
  failed = true;
}
if (failed) {
  console.error(`\nfix: node scripts/sync-presets.mjs`);
  process.exit(1);
}
console.log(`\ninstall OK against ${targetRoot}`);
