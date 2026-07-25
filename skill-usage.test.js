import test from "node:test";
import assert from "node:assert/strict";
import { extractInvokedSkills } from "./skill-usage.js";

test("detects a Codex SKILL.md read", () => {
  assert.deepEqual(
    extractInvokedSkills(
      "exec_command",
      JSON.stringify({ cmd: "sed -n '1,220p' /Users/demo/.agents/skills/frontend-design/SKILL.md" })
    ),
    ["frontend-design"]
  );
});

test("detects a structured Claude Skill call", () => {
  assert.deepEqual(
    extractInvokedSkills("Skill", { skill: "fangxin-image-gen", args: "draw a poster" }),
    ["fangxin-image-gen"]
  );
});

test("detects a variable-based complete skill read", () => {
  assert.deepEqual(
    extractInvokedSkills(
      "exec_command",
      JSON.stringify({
        cmd: "source_skill='/Users/demo/.agents/skills/geo-analysis'\ncat \"$source_skill/SKILL.md\""
      })
    ),
    ["geo-analysis"]
  );
});

test("ignores a path search that does not read the skill", () => {
  assert.deepEqual(
    extractInvokedSkills(
      "exec_command",
      JSON.stringify({ cmd: "rg --files /Users/demo/.agents/skills | rg 'frontend-design/SKILL\\\\.md'" })
    ),
    []
  );
});

test("ignores ordinary prose mentioning a skill", () => {
  assert.deepEqual(
    extractInvokedSkills("message", "I will use the frontend-design Skill."),
    []
  );
});
