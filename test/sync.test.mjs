/**
 * Unit tests for the preset-sync machinery (pure filesystem logic, no
 * harness needed). Runs with `node --test test/`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { syncOnePreset, syncPresetTrees, verifyPresetTrees, dshHome, expandTilde, bundledPresetsRoot } from "../lib/index.js";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "dsh-wf-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function write(dir, rel, content) {
  const path = join(dir, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  return path;
}

test("syncOnePreset copies a fresh preset", () => {
  const { dir, cleanup } = fixture();
  try {
    write(dir, "src/agent.cordis.yml", "- id: a\n  name: x\n");
    write(dir, "src/preset.yml", "name: t\n");
    const status = syncOnePreset(join(dir, "src"), join(dir, "dst"));
    assert.equal(status, "synced");
    assert.equal(readFileSync(join(dir, "dst", "agent.cordis.yml"), "utf8"), "- id: a\n  name: x\n");
  } finally {
    cleanup();
  }
});

test("syncOnePreset is idempotent and reports current", () => {
  const { dir, cleanup } = fixture();
  try {
    write(dir, "src/agent.cordis.yml", "x");
    assert.equal(syncOnePreset(join(dir, "src"), join(dir, "dst")), "synced");
    assert.equal(syncOnePreset(join(dir, "src"), join(dir, "dst")), "current");
  } finally {
    cleanup();
  }
});

test("syncOnePreset updates changed files and prunes removed ones", () => {
  const { dir, cleanup } = fixture();
  try {
    write(dir, "src/a.yml", "v1");
    write(dir, "src/skills/s/SKILL.md", "old");
    syncOnePreset(join(dir, "src"), join(dir, "dst"));
    write(dir, "src/a.yml", "v2");
    rmSync(join(dir, "src", "skills"), { recursive: true, force: true });
    write(dir, "src/skills/t/SKILL.md", "new");
    const status = syncOnePreset(join(dir, "src"), join(dir, "dst"));
    assert.equal(status, "synced");
    assert.equal(readFileSync(join(dir, "dst", "a.yml"), "utf8"), "v2");
    assert.ok(!existsSync(join(dir, "dst", "skills", "s")));
    assert.equal(readFileSync(join(dir, "dst", "skills", "t", "SKILL.md"), "utf8"), "new");
  } finally {
    cleanup();
  }
});

test("syncPresetTrees leaves sibling presets untouched and retires ids", () => {
  const { dir, cleanup } = fixture();
  try {
    write(dir, "src/wf/agent.cordis.yml", "wf");
    write(dir, "dst/other/agent.cordis.yml", "mine");
    write(dir, "dst/stale/agent.cordis.yml", "old");
    const result = syncPresetTrees(join(dir, "src"), join(dir, "dst"), ["stale"]);
    assert.deepEqual(result.synced, ["wf"]);
    assert.deepEqual(result.retired, ["stale"]);
    assert.ok(existsSync(join(dir, "dst", "other", "agent.cordis.yml")), "sibling preset preserved");
    assert.ok(!existsSync(join(dir, "dst", "stale")));
  } finally {
    cleanup();
  }
});

test("verifyPresetTrees reports ok, stale and missing without writing", () => {
  const { dir, cleanup } = fixture();
  try {
    write(dir, "src/a/agent.cordis.yml", "a");
    write(dir, "src/b/agent.cordis.yml", "b");
    syncPresetTrees(join(dir, "src"), join(dir, "dst"));
    let report = verifyPresetTrees(join(dir, "src"), join(dir, "dst"));
    assert.deepEqual(report.map((r) => [r.id, r.status]), [["a", "ok"], ["b", "ok"]]);
    write(dir, "src/a/agent.cordis.yml", "a2");
    rmSync(join(dir, "dst", "b"), { recursive: true, force: true });
    write(dir, "dst/a/extra.yml", "x");
    report = verifyPresetTrees(join(dir, "src"), join(dir, "dst"));
    assert.deepEqual(report.find((r) => r.id === "a").status, "stale");
    assert.deepEqual(report.find((r) => r.id === "a").differing, ["agent.cordis.yml"]);
    assert.deepEqual(report.find((r) => r.id === "a").extra, ["extra.yml"]);
    assert.deepEqual(report.find((r) => r.id === "b").status, "missing");
    // verification never writes: the diverged target files stay diverged
    assert.equal(readFileSync(join(dir, "dst", "a", "agent.cordis.yml"), "utf8"), "a");
  } finally {
    cleanup();
  }
});

test("bundled preset tree exists and carries a composition plus skills", () => {
  const root = bundledPresetsRoot();
  const composition = join(root, "engineering-workflow", "agent.cordis.yml");
  assert.ok(existsSync(composition), "agent.cordis.yml ships with the package");
  const skills = join(root, "engineering-workflow", "skills");
  const names = readdirSync(skills).filter((n) => !n.startsWith("."));
  assert.deepEqual(names.sort(), [
    "engineering-workflow",
    "workflow-planning",
    "workflow-requirements",
    "workflow-subagents",
    "workflow-tdd",
    "workflow-verification",
  ]);
});

test("dshHome and expandTilde behave", () => {
  assert.ok(dshHome().endsWith(".dsh"));
  assert.equal(expandTilde("~"), homedir());
  assert.equal(expandTilde("plain"), "plain");
});
