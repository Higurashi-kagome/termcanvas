import test from "node:test";
import assert from "node:assert/strict";

import { resolveReplayResumeTarget } from "../src/components/sessionReplayModel.ts";
import type { ProjectData } from "../src/types/index.ts";

function project(): ProjectData {
  return {
    id: "project-1",
    name: "termcanvas",
    path: "/repo",
    worktrees: [
      {
        id: "worktree-main",
        name: "main",
        path: "/repo",
        isPrimary: true,
        terminals: [],
      },
      {
        id: "worktree-feature",
        name: "feature",
        path: "/repo/.worktrees/feature",
        terminals: [],
      },
    ],
  };
}

test("resolveReplayResumeTarget keeps exact worktree matches on that worktree", () => {
  const target = resolveReplayResumeTarget([project()], {
    provider: "codex",
    projectDir: "/repo/.worktrees/feature",
    sessionId: "session-1",
  });

  assert.deepEqual(target, {
    provider: "codex",
    projectId: "project-1",
    worktreeId: "worktree-feature",
    sessionId: "session-1",
    usesProjectFallback: false,
  });
});

test("resolveReplayResumeTarget falls back deleted worktree sessions to the project root worktree", () => {
  const target = resolveReplayResumeTarget([project()], {
    provider: "codex",
    projectDir: "/repo/.worktrees/deleted-feature",
    sessionId: "session-2",
  });

  assert.deepEqual(target, {
    provider: "codex",
    projectId: "project-1",
    worktreeId: "worktree-main",
    sessionId: "session-2",
    usesProjectFallback: true,
  });
});

test("resolveReplayResumeTarget does not fall back nested deleted worktree descendants", () => {
  const target = resolveReplayResumeTarget([project()], {
    provider: "codex",
    projectDir: "/repo/.worktrees/deleted-feature/subdir",
    sessionId: "session-3",
  });

  assert.equal(target, null);
});

test("resolveReplayResumeTarget matches deleted worktree paths despite Windows slash style differences", () => {
  const target = resolveReplayResumeTarget(
    [
      {
        id: "project-1",
        name: "termcanvas",
        path: "E:/GitHub/open-source/termcanvas",
        worktrees: [
          {
            id: "worktree-main",
            name: "main",
            path: "E:/GitHub/open-source/termcanvas",
            isPrimary: true,
            terminals: [],
          },
        ],
      },
    ],
    {
      provider: "claude",
      projectDir:
        "E:\\GitHub\\open-source\\termcanvas\\.worktrees\\deleted-feature",
      sessionId: "session-4",
    },
  );

  assert.equal(target?.worktreeId, "worktree-main");
  assert.equal(target?.usesProjectFallback, true);
});
