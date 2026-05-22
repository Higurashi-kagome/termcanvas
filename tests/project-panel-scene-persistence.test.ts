import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSceneDocument,
  sceneDocumentToLegacyState,
} from "../src/canvas/sceneProjection.ts";
import { readWorkspaceSnapshot } from "../src/snapshotBridge.ts";

function createPersistedProject(id: string, path: string) {
  return {
    id,
    name: id,
    path,
    worktrees: [
      {
        id: `${id}-worktree`,
        name: "main",
        path,
        terminals: [],
      },
    ],
  };
}

test("scene document preserves projectPanelOrder during round-trip conversion", () => {
  const scene = buildSceneDocument({
    viewport: { x: 0, y: 0, scale: 1 },
    projects: [
      createPersistedProject("project-1", "/tmp/project-1"),
      createPersistedProject("project-2", "/tmp/project-2"),
    ],
    projectPanelOrder: {
      pinnedProjectIds: ["project-2"],
      unpinnedProjectIds: ["project-1"],
    },
  });

  assert.deepEqual(scene.projectPanelOrder, {
    pinnedProjectIds: ["project-2"],
    unpinnedProjectIds: ["project-1"],
  });

  const legacy = sceneDocumentToLegacyState(scene);
  assert.deepEqual(legacy.projectPanelOrder, {
    pinnedProjectIds: ["project-2"],
    unpinnedProjectIds: ["project-1"],
  });
});

test("readWorkspaceSnapshot normalizes stale projectPanelOrder ids from a v3 workspace snapshot", () => {
  const raw = JSON.stringify({
    version: 3,
    workspace: {
      version: 3,
      activeCanvasId: "canvas-1",
      canvases: [
        {
          id: "canvas-1",
          name: "Default",
          createdAt: 1,
          scene: {
            version: 2,
            camera: { x: 0, y: 0, zoom: 1 },
            projects: [
              createPersistedProject("project-1", "/tmp/project-1"),
              createPersistedProject("project-2", "/tmp/project-2"),
            ],
            browserCards: {},
            annotations: [],
            projectPanelOrder: {
              pinnedProjectIds: ["missing", "project-2", "project-2"],
              unpinnedProjectIds: ["project-1"],
            },
          },
        },
      ],
    },
    scene: {
      version: 2,
      camera: { x: 0, y: 0, zoom: 1 },
      projects: [
        createPersistedProject("project-1", "/tmp/project-1"),
        createPersistedProject("project-2", "/tmp/project-2"),
      ],
      browserCards: {},
      annotations: [],
      projectPanelOrder: {
        pinnedProjectIds: ["missing", "project-2", "project-2"],
        unpinnedProjectIds: ["project-1"],
      },
    },
  });

  const restored = readWorkspaceSnapshot(raw);
  assert.ok(restored && !("skipRestore" in restored));
  if (!restored || "skipRestore" in restored) {
    return;
  }

  assert.deepEqual(restored.scene.projectPanelOrder, {
    pinnedProjectIds: ["project-2"],
    unpinnedProjectIds: ["project-1"],
  });
  assert.deepEqual(restored.legacy.projectPanelOrder, {
    pinnedProjectIds: ["project-2"],
    unpinnedProjectIds: ["project-1"],
  });
});
