import test from "node:test";
import assert from "node:assert/strict";

import { useProjectStore } from "../src/stores/projectStore.ts";
import { useWorkspaceStore } from "../src/stores/workspaceStore.ts";
import type {
  ProjectData,
  ProjectPanelOrderState,
} from "../src/types/index.ts";

function createProject(): ProjectData {
  return {
    id: "project-1",
    name: "Project One",
    path: "/tmp/project-1",
    worktrees: [
      {
        id: "worktree-1",
        name: "main",
        path: "/tmp/project-1",
        terminals: [
          {
            id: "terminal-1",
            title: "Terminal 1",
            type: "shell",
            minimized: false,
            focused: false,
            ptyId: null,
            status: "idle",
            x: 0,
            y: 0,
            width: 640,
            height: 480,
            tags: [],
          },
        ],
      },
    ],
  };
}

function resetStores(projects: ProjectData[]) {
  useProjectStore.setState({
    projects,
    projectPanelOrder: {
      pinnedProjectIds: [],
      unpinnedProjectIds: projects.map((project) => project.id),
    },
    focusedProjectId: null,
    focusedWorktreeId: null,
  });
  useWorkspaceStore.setState({
    workspacePath: null,
    dirty: false,
    lastSavedAt: null,
    lastDirtyAt: null,
  });
}

function createSecondProject(): ProjectData {
  return {
    id: "project-2",
    name: "Project Two",
    path: "/tmp/project-2",
    worktrees: [
      {
        id: "worktree-2",
        name: "main",
        path: "/tmp/project-2",
        terminals: [],
      },
    ],
  };
}

function resetStoresWithOrder(
  projects: ProjectData[],
  projectPanelOrder: ProjectPanelOrderState,
) {
  useProjectStore.setState({
    projects,
    projectPanelOrder,
    focusedProjectId: null,
    focusedWorktreeId: null,
  });
  useWorkspaceStore.setState({
    workspacePath: null,
    dirty: false,
    lastSavedAt: null,
    lastDirtyAt: null,
  });
}

test("syncWorktrees marks the workspace dirty when the project set changes", () => {
  resetStores([createProject()]);

  useProjectStore.getState().syncWorktrees("/tmp/project-1", [
    { path: "/tmp/project-1", branch: "main", isPrimary: true },
    { path: "/tmp/project-1-feature", branch: "feature", isPrimary: false },
  ]);

  assert.equal(useWorkspaceStore.getState().dirty, true);
  assert.ok(useWorkspaceStore.getState().lastDirtyAt !== null);
});

test("updateTerminalAutoApprove marks the workspace dirty", () => {
  resetStores([createProject()]);

  useProjectStore
    .getState()
    .updateTerminalAutoApprove("project-1", "worktree-1", "terminal-1", true);

  assert.equal(useWorkspaceStore.getState().dirty, true);
  assert.equal(
    useProjectStore.getState().projects[0]?.worktrees[0]?.terminals[0]
      ?.autoApprove,
    true,
  );
});

test("updateTerminalType marks the workspace dirty", () => {
  resetStores([createProject()]);

  useProjectStore
    .getState()
    .updateTerminalType("project-1", "worktree-1", "terminal-1", "codex");

  assert.equal(useWorkspaceStore.getState().dirty, true);
  assert.equal(
    useProjectStore.getState().projects[0]?.worktrees[0]?.terminals[0]?.type,
    "codex",
  );
});

test("addProject appends the new project id to the unpinned tail", () => {
  resetStoresWithOrder([createProject()], {
    pinnedProjectIds: [],
    unpinnedProjectIds: ["project-1"],
  });

  useProjectStore.getState().addProject(createSecondProject());

  assert.deepEqual(useProjectStore.getState().projectPanelOrder, {
    pinnedProjectIds: [],
    unpinnedProjectIds: ["project-1", "project-2"],
  });
});

test("removeProject prunes the removed id from projectPanelOrder", () => {
  resetStoresWithOrder([createProject(), createSecondProject()], {
    pinnedProjectIds: ["project-2"],
    unpinnedProjectIds: ["project-1"],
  });

  useProjectStore.getState().removeProject("project-2");

  assert.deepEqual(useProjectStore.getState().projectPanelOrder, {
    pinnedProjectIds: [],
    unpinnedProjectIds: ["project-1"],
  });
});

test("pin, unpin, reorder, and cross-group moves mark the workspace dirty", () => {
  resetStoresWithOrder([createProject(), createSecondProject()], {
    pinnedProjectIds: [],
    unpinnedProjectIds: ["project-1", "project-2"],
  });

  useProjectStore.getState().pinProjectInPanel("project-1");
  useProjectStore.getState().unpinProjectInPanel("project-1");
  useProjectStore
    .getState()
    .reorderProjectPanelGroup("unpinned", "project-2", 0);
  useProjectStore
    .getState()
    .moveProjectPanelItem("project-2", "pinned", 0);

  assert.equal(useWorkspaceStore.getState().dirty, true);
  assert.deepEqual(useProjectStore.getState().projectPanelOrder, {
    pinnedProjectIds: ["project-2"],
    unpinnedProjectIds: ["project-1"],
  });
});
