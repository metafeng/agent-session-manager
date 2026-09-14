import test from "node:test";
import assert from "node:assert/strict";
import { groupProjectRows, resolveSessionProject } from "./project-mapping.js";

const projects = groupProjectRows([
  { id: "general", name: "VibeCoding", position: 2, root_path: "/Users/demo/VibeCoding" },
  { id: "specific", name: "产品项目", position: 1, root_path: "/Users/demo/VibeCoding/product" },
  { id: "specific", name: "产品项目", position: 1, root_path: "/Volumes/product" }
]);

test("groups multiple roots under the same Codex project", () => {
  assert.equal(projects.length, 2);
  assert.deepEqual(projects.find((project) => project.id === "specific").roots, [
    "/Users/demo/VibeCoding/product",
    "/Volumes/product"
  ]);
});

test("prefers an explicit Codex project id", () => {
  assert.equal(resolveSessionProject(projects, "general", "/Users/demo/VibeCoding/product").id, "general");
});

test("uses the most specific project root for legacy sessions", () => {
  assert.equal(resolveSessionProject(projects, null, "/Users/demo/VibeCoding/product/src").id, "specific");
});

test("does not match a directory that only shares a path prefix", () => {
  assert.equal(resolveSessionProject(projects, null, "/Users/demo/VibeCoding-old"), null);
});
