import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLimitedVisibleHistoryGroupSections,
  buildVisibleHistoryGroups,
  buildVisibleHistoryGroupSections,
  countHistoryGroupTopLevelItems,
  collectVisibleHistoryRoots,
  filterHiddenProjectTree,
  filterHiddenEntries,
  groupHistoryByProject,
  hideHistorySubtree,
  resolvePinnedHistoryRoot,
  shouldRefreshHistorySection,
} from "../src/components/historySectionModel.ts";
import type {
  SessionHistoryNode,
  SessionHistoryProjectGroup,
  SessionHistoryProjectTree,
} from "../shared/sessions.ts";

test("shouldRefreshHistorySection only refreshes overlapping project scopes", () => {
  assert.equal(
    shouldRefreshHistorySection(
      ["/tmp/project-a", "/tmp/project-b"],
      ["/tmp/project-b"],
    ),
    true,
  );
  assert.equal(
    shouldRefreshHistorySection(
      ["/tmp/project-a", "/tmp/project-b"],
      ["/tmp/project-c"],
    ),
    false,
  );
});

test("shouldRefreshHistorySection ignores empty or blank scopes", () => {
  assert.equal(shouldRefreshHistorySection([], ["/tmp/project-a"]), false);
  assert.equal(
    shouldRefreshHistorySection(["   "], ["/tmp/project-a"]),
    false,
  );
  assert.equal(
    shouldRefreshHistorySection(["/tmp/project-a"], []),
    false,
  );
});

test("groupHistoryByProject buckets entries and orders newest-first", () => {
  const entries = [
    { sessionId: "s1", projectDir: "/p/a", lastActivityAt: "2026-04-25T12:00:00Z" },
    { sessionId: "s2", projectDir: "/p/b", lastActivityAt: "2026-04-25T13:00:00Z" },
    { sessionId: "s3", projectDir: "/p/a", lastActivityAt: "2026-04-25T14:00:00Z" },
    { sessionId: "s4", projectDir: "/p/b", lastActivityAt: "2026-04-25T11:00:00Z" },
  ];

  const groups = groupHistoryByProject(entries);

  // Group order: /p/a is newest because s3 (14:00) is the newest of all.
  assert.deepEqual(
    groups.map((g) => g.projectDir),
    ["/p/a", "/p/b"],
  );
  // Within each group, newest-first by lastActivityAt.
  assert.deepEqual(
    groups[0].entries.map((e) => e.sessionId),
    ["s3", "s1"],
  );
  assert.deepEqual(
    groups[1].entries.map((e) => e.sessionId),
    ["s2", "s4"],
  );
});

test("groupHistoryByProject handles empty input", () => {
  assert.deepEqual(groupHistoryByProject([]), []);
});

test("filterHiddenEntries removes entries by sessionId", () => {
  const entries = [
    { sessionId: "s1", projectDir: "/p/a", lastActivityAt: "x" },
    { sessionId: "s2", projectDir: "/p/a", lastActivityAt: "x" },
    { sessionId: "s3", projectDir: "/p/b", lastActivityAt: "x" },
  ];
  const hidden = new Set(["s2"]);
  const result = filterHiddenEntries(entries, hidden);
  assert.deepEqual(result.map((e) => e.sessionId), ["s1", "s3"]);
});

test("filterHiddenEntries returns input unchanged when hidden is empty", () => {
  const entries = [
    { sessionId: "s1", projectDir: "/p/a", lastActivityAt: "x" },
  ];
  const result = filterHiddenEntries(entries, new Set());
  assert.equal(result, entries);
});

function node(
  sessionId: string,
  children: SessionHistoryNode[] = [],
): SessionHistoryNode {
  return {
    sessionId,
    provider: "codex",
    projectDir: "/repo",
    filePath: `/repo/${sessionId}.jsonl`,
    firstPrompt: sessionId,
    startedAt: "2026-05-18T10:00:00.000Z",
    lastActivityAt: "2026-05-18T10:00:00.000Z",
    treeLastActivityAt: "2026-05-18T10:00:00.000Z",
    rootSessionId: sessionId,
    depth: 0,
    relationshipSource: "none",
    hasChildren: children.length > 0,
    childCount: children.length,
    children,
  };
}

test("resolvePinnedHistoryRoot maps any descendant back to the root session", () => {
  const roots = [
    node("root", [node("child", [node("grandchild")])]),
  ];

  assert.equal(resolvePinnedHistoryRoot(roots, "grandchild"), "root");
});

test("hideHistorySubtree hides a child and all descendants without hiding siblings", () => {
  const roots = [
    node("root", [node("child", [node("grandchild")]), node("sibling")]),
  ];

  const hidden = hideHistorySubtree(new Set<string>(), roots, "child");

  assert.deepEqual([...hidden].sort(), ["child", "grandchild"]);
});

test("collectVisibleHistoryRoots applies the root limit only to roots", () => {
  const roots = [node("root-a"), node("root-b")];

  const visible = collectVisibleHistoryRoots(roots, 1);

  assert.deepEqual(
    visible.map((entry) => entry.sessionId),
    ["root-a"],
  );
});

test("filterHiddenProjectTree removes hidden descendants while keeping visible siblings", () => {
  const tree: SessionHistoryProjectTree = {
    projectDir: "/repo",
    roots: [node("root", [node("child"), node("sibling")])],
    sessionCount: 3,
    rootCount: 1,
    latestActivityAt: "2026-05-18T10:00:00.000Z",
  };

  const filtered = filterHiddenProjectTree(tree, new Set(["child"]));

  assert.equal(filtered?.roots.length, 1);
  assert.deepEqual(
    filtered?.roots[0]?.children.map((entry) => entry.sessionId),
    ["sibling"],
  );
});

test("buildVisibleHistoryGroups preserves worktree labels", () => {
  const groups: SessionHistoryProjectGroup[] = [
    {
      projectPath: "/repo",
      projectLabel: "repo",
      projectTree: {
        projectDir: "/repo",
        roots: [node("project-root")],
        sessionCount: 1,
        rootCount: 1,
        latestActivityAt: "2026-05-19T10:00:00.000Z",
      },
      worktrees: [
        {
          worktreePath: "/repo/.worktrees/feat-auto-focus",
          worktreeLabel: "feat-auto-focus",
          tree: {
            projectDir: "/repo/.worktrees/feat-auto-focus",
            roots: [node("worktree-root")],
            sessionCount: 1,
            rootCount: 1,
            latestActivityAt: "2026-05-19T11:00:00.000Z",
          },
        },
      ],
      latestActivityAt: "2026-05-19T11:00:00.000Z",
    },
  ];

  const visible = buildVisibleHistoryGroups(groups);

  assert.equal(visible[0]?.projectLabel, "repo");
  assert.equal(visible[0]?.worktrees[0]?.worktreeLabel, "feat-auto-focus");
});

test("buildVisibleHistoryGroups removes worktrees whose trees are fully hidden", () => {
  const groups: SessionHistoryProjectGroup[] = [
    {
      projectPath: "/repo",
      projectLabel: "repo",
      projectTree: null,
      worktrees: [
        {
          worktreePath: "/repo/.worktrees/feat-auto-focus",
          worktreeLabel: "feat-auto-focus",
          tree: {
            projectDir: "/repo/.worktrees/feat-auto-focus",
            roots: [node("worktree-root")],
            sessionCount: 1,
            rootCount: 1,
            latestActivityAt: "2026-05-19T11:00:00.000Z",
          },
        },
      ],
      latestActivityAt: "2026-05-19T11:00:00.000Z",
    },
  ];

  const visible = buildVisibleHistoryGroups(groups, new Set(["worktree-root"]));

  assert.deepEqual(visible, []);
});

test("buildVisibleHistoryGroupSections sorts project and worktree sections by latest activity", () => {
  const sections = buildVisibleHistoryGroupSections({
    projectPath: "/repo",
    projectLabel: "repo",
    projectTree: {
      projectDir: "/repo",
      roots: [node("project-root")],
      sessionCount: 1,
      rootCount: 1,
      latestActivityAt: "2026-05-19T10:00:00.000Z",
    },
    worktrees: [
      {
        worktreePath: "/repo/.worktrees/feat-auto-focus",
        worktreeLabel: "feat-auto-focus",
        tree: {
          projectDir: "/repo/.worktrees/feat-auto-focus",
          roots: [node("worktree-root")],
          sessionCount: 1,
          rootCount: 1,
          latestActivityAt: "2026-05-19T11:00:00.000Z",
        },
      },
    ],
    latestActivityAt: "2026-05-19T11:00:00.000Z",
  });

  assert.deepEqual(
    sections.map((section) => section.kind),
    ["worktree", "project"],
  );
});

test("countHistoryGroupTopLevelItems counts project roots and worktree headers", () => {
  const count = countHistoryGroupTopLevelItems({
    projectPath: "/repo",
    projectLabel: "repo",
    projectTree: {
      projectDir: "/repo",
      roots: [node("project-root-a"), node("project-root-b")],
      sessionCount: 2,
      rootCount: 2,
      latestActivityAt: "2026-05-19T10:00:00.000Z",
    },
    worktrees: [
      {
        worktreePath: "/repo/.worktrees/feat-a",
        worktreeLabel: "feat-a",
        tree: {
          projectDir: "/repo/.worktrees/feat-a",
          roots: [node("worktree-root-a")],
          sessionCount: 1,
          rootCount: 1,
          latestActivityAt: "2026-05-19T11:00:00.000Z",
        },
      },
    ],
    latestActivityAt: "2026-05-19T11:00:00.000Z",
  });

  assert.equal(count, 3);
});

test("buildLimitedVisibleHistoryGroupSections applies the limit to visible top-level rows", () => {
  const result = buildLimitedVisibleHistoryGroupSections(
    {
      projectPath: "/repo",
      projectLabel: "repo",
      projectTree: {
        projectDir: "/repo",
        roots: [node("project-root-a"), node("project-root-b")],
        sessionCount: 2,
        rootCount: 2,
        latestActivityAt: "2026-05-19T10:00:00.000Z",
      },
      worktrees: [
        {
          worktreePath: "/repo/.worktrees/feat-a",
          worktreeLabel: "feat-a",
          tree: {
            projectDir: "/repo/.worktrees/feat-a",
            roots: [node("worktree-root-a")],
            sessionCount: 1,
            rootCount: 1,
            latestActivityAt: "2026-05-19T11:00:00.000Z",
          },
        },
      ],
      latestActivityAt: "2026-05-19T11:00:00.000Z",
    },
    2,
  );

  assert.equal(result.hiddenCount, 1);
  assert.deepEqual(
    result.sections.map((section) => section.kind),
    ["worktree", "project"],
  );
  const projectSection = result.sections.find(
    (section) => section.kind === "project",
  );
  assert.deepEqual(
    projectSection && projectSection.kind === "project"
      ? projectSection.visibleRoots.map((root) => root.sessionId)
      : [],
    ["project-root-a"],
  );
});
