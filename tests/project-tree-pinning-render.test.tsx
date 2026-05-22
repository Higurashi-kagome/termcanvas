import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  ProjectTree,
  getProjectPinIconStyle,
  preferProjectRowCollisions,
  toProjectRowTranslateTransform,
} from "../src/components/ProjectTree.tsx";
import { en } from "../src/i18n/en.ts";
import { useLocaleStore } from "../src/stores/localeStore.ts";

function installDom() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const dom = new JSDOM(
    "<!doctype html><html><body><div id='root'></div></body></html>",
    { url: "http://localhost", pretendToBeVisual: true },
  );
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.localStorage = dom.window.localStorage;
  return dom;
}

function createProjectGroup(projectId: string, projectName: string) {
  return {
    projectId,
    projectName,
    projectPath: `/tmp/${projectId}`,
    statusSummary: { attention: 0, running: 0, freshDone: 0, done: 0, idle: 0 },
    worktrees: [],
  };
}

test("ProjectTree renders the project pin button before the task button when projectPanelOrdering is enabled", async () => {
  const dom = installDom();
  let root: Root | null = null;
  const toggled: string[] = [];
  useLocaleStore.setState({ locale: "en" });

  try {
    const container = document.getElementById("root");
    assert.ok(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <ProjectTree
          projects={[createProjectGroup("project-1", "Project One")]}
          renderTerminal={() => null}
          projectPanelOrdering={{
            pinnedProjectIds: [],
            onTogglePin(projectId) {
              toggled.push(projectId);
            },
            onMove() {},
          }}
        />,
      );
    });

    const buttons = Array.from(document.querySelectorAll("button"));
    const pinButton = buttons.find(
      (button) =>
        button.getAttribute("aria-label") === en.panel_project_pin("Project One"),
    );
    const taskButton = buttons.find(
      (button) =>
        button.getAttribute("aria-label") ===
        en["pin.triggerLabel"]("Project One"),
    );

    assert.ok(pinButton, "pin button should render in left panel mode");
    assert.ok(taskButton, "task button should still render");
    assert.equal(
      !!(
        pinButton.compareDocumentPosition(taskButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
      ),
      true,
    );

    await act(async () => {
      pinButton.click();
    });

    assert.deepEqual(toggled, ["project-1"]);
  } finally {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    dom.window.close();
  }
});

test("ProjectTree does not render the project pin button when projectPanelOrdering is omitted", async () => {
  const dom = installDom();
  let root: Root | null = null;
  useLocaleStore.setState({ locale: "en" });

  try {
    const container = document.getElementById("root");
    assert.ok(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <ProjectTree
          projects={[createProjectGroup("project-1", "Project One")]}
          renderTerminal={() => null}
        />,
      );
    });

    const pinButton = Array.from(document.querySelectorAll("button")).find(
      (button) =>
        button.getAttribute("aria-label") === en.panel_project_pin("Project One"),
    );

    assert.equal(pinButton ?? null, null);
  } finally {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    dom.window.close();
  }
});

test("toProjectRowTranslateTransform only keeps translate and never emits scale", () => {
  assert.equal(toProjectRowTranslateTransform(null), undefined);
  assert.equal(
    toProjectRowTranslateTransform({
      x: 12.5,
      y: -8,
    }),
    "translate3d(12.5px, -8px, 0)",
  );
});

test("preferProjectRowCollisions prioritizes project rows over group containers", () => {
  const collisions = [
    { id: "project-panel-pinned" },
    { id: "project-2" },
    { id: "project-1" },
  ];

  assert.deepEqual(
    preferProjectRowCollisions(
      collisions,
      new Set(["project-1", "project-2"]),
    ),
    [{ id: "project-2" }, { id: "project-1" }],
  );
});

test("preferProjectRowCollisions falls back to original collisions when no project row is hit", () => {
  const collisions = [{ id: "project-panel-pinned" }];

  assert.deepEqual(
    preferProjectRowCollisions(collisions, new Set(["project-1"])),
    collisions,
  );
});

test("getProjectPinIconStyle uses a tilted icon for unpinned projects and leaves pinned projects upright", () => {
  assert.equal(getProjectPinIconStyle(true), undefined);
  assert.deepEqual(getProjectPinIconStyle(false), {
    transform: "rotate(28deg)",
  });
});

test("ProjectTree accepts the unified move callback in left panel ordering mode", async () => {
  const dom = installDom();
  let root: Root | null = null;
  const moves: Array<{
    projectId: string;
    targetGroup: "pinned" | "unpinned";
    targetIndex: number;
  }> = [];
  useLocaleStore.setState({ locale: "en" });

  try {
    const container = document.getElementById("root");
    assert.ok(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <ProjectTree
          projects={[
            createProjectGroup("project-1", "Project One"),
            createProjectGroup("project-2", "Project Two"),
          ]}
          renderTerminal={() => null}
          projectPanelOrdering={{
            pinnedProjectIds: ["project-1"],
            onTogglePin() {},
            onMove(projectId, targetGroup, targetIndex) {
              moves.push({ projectId, targetGroup, targetIndex });
            },
          }}
        />,
      );
    });

    assert.deepEqual(moves, []);
  } finally {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    dom.window.close();
  }
});
