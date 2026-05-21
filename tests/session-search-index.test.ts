import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  clearSessionIndexCache,
  listSessionGroupsForScope,
  listSessionTreesForProjects,
  listSessionsForProjects,
  listSessionsForProjectsPaged,
} from "../electron/session-search-index.ts";

async function withTempHome(
  fn: (homeDir: string) => Promise<void> | void,
): Promise<void> {
  const homeDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "termcanvas-session-search-index-"),
  );
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;
  try {
    clearSessionIndexCache();
    await fn(homeDir);
  } finally {
    clearSessionIndexCache();
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousUserProfile;
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

function writeJsonl(filePath: string, lines: object[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    lines.map((line) => JSON.stringify(line)).join("\n"),
    "utf-8",
  );
}

test("listSessionsForProjects matches codex cwd against canvas paths despite slash style differences on Windows", async () => {
  await withTempHome(async (homeDir) => {
    const sessionFile = path.join(
      homeDir,
      ".codex",
      "sessions",
      "2026",
      "05",
      "01",
      "rollout-2026-05-01T21-02-49-session-1.jsonl",
    );
    writeJsonl(sessionFile, [
      {
        timestamp: "2026-05-01T13:02:49.179Z",
        type: "session_meta",
        payload: {
          id: "session-1",
          cwd: "E:\\GitHub\\open-source\\termcanvas",
          timestamp: "2026-05-01T13:02:49.179Z",
        },
      },
      {
        timestamp: "2026-05-01T13:02:50.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "调查历史面板为什么缺会话",
        },
      },
    ]);

    const entries = await listSessionsForProjects([
      "E:/GitHub/open-source/termcanvas",
    ]);

    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.sessionId, "session-1");
    assert.equal(
      entries[0]?.projectDir,
      "E:\\GitHub\\open-source\\termcanvas",
    );
  });
});

test("listSessionsForProjectsPaged applies the same normalized matching for codex and kimi sessions", async () => {
  await withTempHome(async (homeDir) => {
    const codexFile = path.join(
      homeDir,
      ".codex",
      "sessions",
      "2026",
      "05",
      "01",
      "rollout-2026-05-01T21-02-49-session-codex.jsonl",
    );
    writeJsonl(codexFile, [
      {
        timestamp: "2026-05-01T13:02:49.179Z",
        type: "session_meta",
        payload: {
          id: "session-codex",
          cwd: "E:\\GitHub\\others\\test-repo",
          timestamp: "2026-05-01T13:02:49.179Z",
        },
      },
      {
        timestamp: "2026-05-01T13:02:50.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "修一下历史面板",
        },
      },
    ]);

    const { entries } = await listSessionsForProjectsPaged(
      ["E:/GitHub/others/test-repo"],
      { limit: 10, offset: 0 },
    );

    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.sessionId, "session-codex");
  });
});

test("listSessionGroupsForScope avoids hydrating unrelated Codex JSONL files", async () => {
  await withTempHome(async (homeDir) => {
    const targetFile = path.join(
      homeDir,
      ".codex",
      "sessions",
      "2026",
      "05",
      "21",
      "target.jsonl",
    );
    const unrelatedFile = path.join(
      homeDir,
      ".codex",
      "sessions",
      "2026",
      "05",
      "21",
      "unrelated.jsonl",
    );
    writeJsonl(targetFile, [
      {
        timestamp: "2026-05-21T10:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "target-session",
          cwd: "/repo",
        },
      },
      {
        timestamp: "2026-05-21T10:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "target prompt",
        },
      },
    ]);
    writeJsonl(unrelatedFile, [
      {
        timestamp: "2026-05-21T10:01:00.000Z",
        type: "session_meta",
        payload: {
          id: "unrelated-session",
          cwd: "/other",
        },
      },
      {
        timestamp: "2026-05-21T10:01:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "unrelated prompt",
        },
      },
    ]);
    const originalCreateReadStream = fs.createReadStream;
    const hydratedPaths: string[] = [];
    fs.createReadStream = ((filePath, options) => {
      hydratedPaths.push(path.normalize(String(filePath)));
      return originalCreateReadStream.call(fs, filePath, options);
    }) as typeof fs.createReadStream;

    try {
      const groups = await listSessionGroupsForScope([
        {
          projectPath: "/repo",
          worktreePaths: [],
        },
      ]);

      assert.equal(groups.length, 1);
      assert.deepEqual(
        groups[0]?.projectTree?.roots.map((node) => node.sessionId),
        ["target-session"],
      );
      assert.ok(
        hydratedPaths.includes(path.normalize(targetFile)),
        "target session should still be hydrated for display metadata",
      );
      assert.equal(
        hydratedPaths.includes(path.normalize(unrelatedFile)),
        false,
        "unrelated Codex sessions should not be hydrated while opening history",
      );
    } finally {
      fs.createReadStream = originalCreateReadStream;
    }
  });
});

test("listSessionTreesForProjects nests sessions only when the raw session contains a confirmed parent field", async () => {
  await withTempHome(async (homeDir) => {
    const rootFile = path.join(
      homeDir,
      ".codex",
      "sessions",
      "2026",
      "05",
      "18",
      "root.jsonl",
    );
    const childFile = path.join(
      homeDir,
      ".codex",
      "sessions",
      "2026",
      "05",
      "18",
      "child.jsonl",
    );

    writeJsonl(rootFile, [
      {
        timestamp: "2026-05-18T10:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "root-session",
          cwd: "/repo",
        },
      },
      {
        timestamp: "2026-05-18T10:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "root prompt",
        },
      },
    ]);
    writeJsonl(childFile, [
      {
        timestamp: "2026-05-18T10:05:00.000Z",
        type: "session_meta",
        payload: {
          id: "child-session",
          cwd: "/repo",
          forked_from_id: "root-session",
        },
      },
      {
        timestamp: "2026-05-18T10:05:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "child prompt",
        },
      },
    ]);

    const trees = await listSessionTreesForProjects(["/repo"]);

    assert.equal(trees.length, 1);
    assert.deepEqual(
      trees[0]?.roots.map((node) => node.sessionId),
      ["root-session"],
    );
    assert.deepEqual(
      trees[0]?.roots[0]?.children.map((node) => node.sessionId),
      ["child-session"],
    );
  });
});

test("listSessionTreesForProjects recognizes Codex subagent parent_thread_id as a confirmed relationship", async () => {
  await withTempHome(async (homeDir) => {
    const parentFile = path.join(
      homeDir,
      ".codex",
      "sessions",
      "2026",
      "05",
      "18",
      "parent.jsonl",
    );
    const childFile = path.join(
      homeDir,
      ".codex",
      "sessions",
      "2026",
      "05",
      "18",
      "child-subagent.jsonl",
    );

    writeJsonl(parentFile, [
      {
        timestamp: "2026-05-18T10:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "parent-session",
          cwd: "/repo",
        },
      },
      {
        timestamp: "2026-05-18T10:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "parent prompt",
        },
      },
    ]);
    writeJsonl(childFile, [
      {
        timestamp: "2026-05-18T10:05:00.000Z",
        type: "session_meta",
        payload: {
          id: "child-session",
          cwd: "/repo",
          thread_source: "subagent",
          source: {
            subagent: {
              thread_spawn: {
                parent_thread_id: "parent-session",
                depth: 1,
              },
            },
          },
        },
      },
      {
        timestamp: "2026-05-18T10:05:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "child prompt",
        },
      },
    ]);

    const trees = await listSessionTreesForProjects(["/repo"]);

    assert.equal(trees.length, 1);
    assert.deepEqual(
      trees[0]?.roots.map((node) => node.sessionId),
      ["parent-session"],
    );
    assert.deepEqual(
      trees[0]?.roots[0]?.children.map((node) => node.sessionId),
      ["child-session"],
    );
  });
});

test("listSessionGroupsForScope keeps project-root sessions at the project level and groups exact worktree sessions separately", async () => {
  await withTempHome(async (homeDir) => {
    const projectFile = path.join(
      homeDir,
      ".codex",
      "sessions",
      "2026",
      "05",
      "19",
      "project-root.jsonl",
    );
    const worktreeFile = path.join(
      homeDir,
      ".codex",
      "sessions",
      "2026",
      "05",
      "19",
      "worktree-root.jsonl",
    );
    writeJsonl(projectFile, [
      {
        timestamp: "2026-05-19T10:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "project-session",
          cwd: "/repo",
        },
      },
      {
        timestamp: "2026-05-19T10:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "project root prompt",
        },
      },
    ]);
    writeJsonl(worktreeFile, [
      {
        timestamp: "2026-05-19T11:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "worktree-session",
          cwd: "/repo/.worktrees/feat-auto-focus",
        },
      },
      {
        timestamp: "2026-05-19T11:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "worktree prompt",
        },
      },
    ]);

    const groups = await listSessionGroupsForScope([
      {
        projectPath: "/repo",
        worktreePaths: ["/repo/.worktrees/feat-auto-focus"],
      },
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.projectPath, "/repo");
    assert.equal(groups[0]?.projectTree?.projectDir, "/repo");
    assert.deepEqual(
      groups[0]?.projectTree?.roots.map((node) => node.sessionId),
      ["project-session"],
    );
    assert.deepEqual(
      groups[0]?.worktrees.map((group) => group.worktreePath),
      ["/repo/.worktrees/feat-auto-focus"],
    );
    assert.deepEqual(
      groups[0]?.worktrees[0]?.tree.roots.map((node) => node.sessionId),
      ["worktree-session"],
    );
  });
});

test("listSessionGroupsForScope groups deleted worktree sessions under their project", async () => {
  await withTempHome(async (homeDir) => {
    const deletedWorktreeFile = path.join(
      homeDir,
      ".codex",
      "sessions",
      "2026",
      "05",
      "20",
      "deleted-worktree-root.jsonl",
    );
    const descendantFile = path.join(
      homeDir,
      ".codex",
      "sessions",
      "2026",
      "05",
      "20",
      "deleted-worktree-descendant.jsonl",
    );
    writeJsonl(deletedWorktreeFile, [
      {
        timestamp: "2026-05-20T10:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "deleted-worktree-session",
          cwd: "/repo/.worktrees/removed-feature",
        },
      },
      {
        timestamp: "2026-05-20T10:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "deleted worktree prompt",
        },
      },
    ]);
    writeJsonl(descendantFile, [
      {
        timestamp: "2026-05-20T11:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "deleted-worktree-descendant-session",
          cwd: "/repo/.worktrees/removed-feature/subdir",
        },
      },
      {
        timestamp: "2026-05-20T11:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "deleted worktree descendant prompt",
        },
      },
    ]);

    const groups = await listSessionGroupsForScope([
      {
        projectPath: "/repo",
        worktreePaths: [],
      },
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.projectTree, null);
    assert.deepEqual(
      groups[0]?.worktrees.map((group) => ({
        path: group.worktreePath,
        label: group.worktreeLabel,
        deleted: group.isDeleted,
        sessions: group.tree.roots.map((node) => node.sessionId),
      })),
      [
        {
          path: "/repo/.worktrees/removed-feature",
          label: "removed-feature",
          deleted: true,
          sessions: ["deleted-worktree-session"],
        },
      ],
    );
  });
});

test("listSessionGroupsForScope matches deleted worktree sessions despite Windows slash style differences", async () => {
  await withTempHome(async (homeDir) => {
    const deletedWorktreeFile = path.join(
      homeDir,
      ".codex",
      "sessions",
      "2026",
      "05",
      "20",
      "deleted-worktree-windows.jsonl",
    );
    writeJsonl(deletedWorktreeFile, [
      {
        timestamp: "2026-05-20T12:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "deleted-worktree-windows-session",
          cwd: "E:\\GitHub\\open-source\\termcanvas\\.worktrees\\removed-feature",
        },
      },
      {
        timestamp: "2026-05-20T12:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "deleted worktree windows prompt",
        },
      },
    ]);

    const groups = await listSessionGroupsForScope([
      {
        projectPath: "E:/GitHub/open-source/termcanvas",
        worktreePaths: [],
      },
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.worktrees[0]?.isDeleted, true);
    assert.deepEqual(
      groups[0]?.worktrees[0]?.tree.roots.map((node) => node.sessionId),
      ["deleted-worktree-windows-session"],
    );
  });
});

test("listSessionGroupsForScope discovers deleted worktree sessions stored in Claude project directories", async () => {
  await withTempHome(async (homeDir) => {
    const claudeFile = path.join(
      homeDir,
      ".claude",
      "projects",
      "-repo-.worktrees-removed-feature",
      "claude-deleted-worktree.jsonl",
    );
    writeJsonl(claudeFile, [
      {
        timestamp: "2026-05-20T10:00:00.000Z",
        type: "user",
        cwd: "/repo/.worktrees/removed-feature",
        message: {
          role: "user",
          content: "deleted claude worktree prompt",
        },
      },
    ]);

    const groups = await listSessionGroupsForScope([
      {
        projectPath: "/repo",
        worktreePaths: [],
      },
    ]);

    assert.equal(groups.length, 1);
    assert.deepEqual(
      groups[0]?.worktrees.map((group) => ({
        label: group.worktreeLabel,
        deleted: group.isDeleted,
        sessions: group.tree.roots.map((node) => node.sessionId),
      })),
      [
        {
          label: "removed-feature",
          deleted: true,
          sessions: ["claude-deleted-worktree"],
        },
      ],
    );
  });
});

test("listSessionGroupsForScope omits worktrees with no exact-match sessions and ignores descendant directories", async () => {
  await withTempHome(async (homeDir) => {
    const descendantFile = path.join(
      homeDir,
      ".codex",
      "sessions",
      "2026",
      "05",
      "19",
      "worktree-descendant.jsonl",
    );
    writeJsonl(descendantFile, [
      {
        timestamp: "2026-05-19T12:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "descendant-session",
          cwd: "/repo/.worktrees/feat-auto-focus/subdir",
        },
      },
      {
        timestamp: "2026-05-19T12:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "descendant prompt",
        },
      },
    ]);

    const groups = await listSessionGroupsForScope([
      {
        projectPath: "/repo",
        worktreePaths: [
          "/repo/.worktrees/feat-auto-focus",
          "/repo/.worktrees/unused",
        ],
      },
    ]);

    assert.equal(groups.length, 0);
  });
});

test("listSessionGroupsForScope does not duplicate project-root sessions when scope worktrees include the project path", async () => {
  await withTempHome(async (homeDir) => {
    const projectFile = path.join(
      homeDir,
      ".codex",
      "sessions",
      "2026",
      "05",
      "19",
      "project-root-duplicate-scope.jsonl",
    );
    writeJsonl(projectFile, [
      {
        timestamp: "2026-05-19T13:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "project-session",
          cwd: "/repo",
        },
      },
      {
        timestamp: "2026-05-19T13:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "project root prompt",
        },
      },
    ]);

    const groups = await listSessionGroupsForScope([
      {
        projectPath: "/repo",
        worktreePaths: ["/repo"],
      },
    ]);

    assert.equal(groups.length, 1);
    assert.deepEqual(
      groups[0]?.projectTree?.roots.map((node) => node.sessionId),
      ["project-session"],
    );
    assert.deepEqual(groups[0]?.worktrees, []);
  });
});
