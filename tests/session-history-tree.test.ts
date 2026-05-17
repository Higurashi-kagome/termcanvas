import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHistoryProjectTrees,
  type HistoryTreeInputEntry,
} from "../electron/session-history-tree.ts";

function entry(
  overrides: Partial<HistoryTreeInputEntry> &
    Pick<HistoryTreeInputEntry, "sessionId">,
): HistoryTreeInputEntry {
  return {
    sessionId: overrides.sessionId,
    provider: overrides.provider ?? "codex",
    projectDir: overrides.projectDir ?? "/repo",
    filePath:
      overrides.filePath ?? `/repo/.sessions/${overrides.sessionId}.jsonl`,
    firstPrompt: overrides.firstPrompt ?? overrides.sessionId,
    startedAt: overrides.startedAt ?? "2026-05-18T10:00:00.000Z",
    lastActivityAt: overrides.lastActivityAt ?? "2026-05-18T10:05:00.000Z",
    estimatedMessageCount: overrides.estimatedMessageCount ?? 1,
    fileSize: overrides.fileSize ?? 128,
    confirmedParentSessionId: overrides.confirmedParentSessionId,
  };
}

test("buildHistoryProjectTrees nests confirmed children and sorts roots by subtree activity", () => {
  const trees = buildHistoryProjectTrees([
    entry({ sessionId: "root-a", lastActivityAt: "2026-05-18T10:00:00.000Z" }),
    entry({
      sessionId: "child-a1",
      confirmedParentSessionId: "root-a",
      lastActivityAt: "2026-05-18T10:30:00.000Z",
    }),
    entry({ sessionId: "root-b", lastActivityAt: "2026-05-18T10:20:00.000Z" }),
  ]);

  assert.equal(trees.length, 1);
  assert.deepEqual(
    trees[0].roots.map((node) => node.sessionId),
    ["root-a", "root-b"],
  );
  assert.equal(trees[0].roots[0]?.treeLastActivityAt, "2026-05-18T10:30:00.000Z");
  assert.deepEqual(
    trees[0].roots[0]?.children.map((node) => node.sessionId),
    ["child-a1"],
  );
});

test("buildHistoryProjectTrees drops invalid confirmed edges and keeps those sessions as roots", () => {
  const trees = buildHistoryProjectTrees([
    entry({ sessionId: "root-a", projectDir: "/repo-a" }),
    entry({
      sessionId: "cross-project-child",
      projectDir: "/repo-b",
      confirmedParentSessionId: "root-a",
    }),
    entry({
      sessionId: "cycle-a",
      confirmedParentSessionId: "cycle-b",
    }),
    entry({
      sessionId: "cycle-b",
      confirmedParentSessionId: "cycle-a",
    }),
  ]);

  const repoA = trees.find((tree) => tree.projectDir === "/repo-a");
  const repoB = trees.find((tree) => tree.projectDir === "/repo-b");
  const repo = trees.find((tree) => tree.projectDir === "/repo");

  assert.deepEqual(repoA?.roots.map((node) => node.sessionId), ["root-a"]);
  assert.deepEqual(repoB?.roots.map((node) => node.sessionId), ["cross-project-child"]);
  assert.deepEqual(repo?.roots.map((node) => node.sessionId), ["cycle-a", "cycle-b"]);
});
