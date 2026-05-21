import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { HistorySection } from "../src/components/SessionsPanel.tsx";
import { useLeftPanelUiStateStore } from "../src/stores/leftPanelUiStateStore.ts";
import type { SessionHistoryProjectGroup } from "../shared/sessions.ts";
import { en } from "../src/i18n/en.ts";

function installDom() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const dom = new JSDOM(
    "<!doctype html><html><body><div id='root'></div></body></html>",
    { url: "http://localhost", pretendToBeVisual: true },
  );
  const { window } = dom;

  globalThis.window = window as unknown as Window & typeof globalThis;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Node = window.Node;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.localStorage = window.localStorage;

  return dom;
}

function historyNode(sessionId: string) {
  return {
    sessionId,
    provider: "codex" as const,
    projectDir: "/repo",
    filePath: `/repo/${sessionId}.jsonl`,
    firstPrompt: `Prompt ${sessionId}`,
    startedAt: "2026-05-21T10:00:00.000Z",
    lastActivityAt: "2026-05-21T10:00:00.000Z",
    treeLastActivityAt: "2026-05-21T10:00:00.000Z",
    rootSessionId: sessionId,
    depth: 0,
    relationshipSource: "none" as const,
    hasChildren: false,
    childCount: 0,
    children: [],
  };
}

function historyGroup(): SessionHistoryProjectGroup {
  return {
    projectPath: "/repo",
    projectLabel: "repo",
    projectTree: {
      projectDir: "/repo",
      roots: [historyNode("session-1")],
      sessionCount: 1,
      rootCount: 1,
      latestActivityAt: "2026-05-21T10:00:00.000Z",
    },
    worktrees: [],
    latestActivityAt: "2026-05-21T10:00:00.000Z",
  };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

test("HistorySection collapses a project immediately after toggling it", async () => {
  const dom = installDom();
  let root: Root | null = null;

  try {
    window.termcanvas = {
      search: {
        listSessionGroups: async () => [historyGroup()],
      },
      sessions: {
        onHistoryChanged: () => () => {},
      },
    } as unknown as Window["termcanvas"];
    useLeftPanelUiStateStore.setState({
      version: 1,
      sessions: {
        projectCollapsedByPath: {},
        worktreeCollapsedByPath: {},
      },
      history: {
        projectCollapsedByPath: {},
      },
    });

    const container = document.getElementById("root");
    assert.ok(container, "test root should exist");
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HistorySection
          scopeProjects={[{ projectPath: "/repo", worktreePaths: [] }]}
          onOpen={() => {}}
          t={en}
          showHeader={false}
        />,
      );
    });
    await flushEffects();

    assert.ok(
      document.body.textContent?.includes("Prompt session-1"),
      "history row should render before collapsing",
    );

    const projectButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("repo"),
    );
    assert.ok(projectButton, "project group toggle should render");

    await act(async () => {
      projectButton.click();
    });

    assert.equal(
      document.body.textContent?.includes("Prompt session-1"),
      false,
      "history row should be hidden on the same render turn as the click",
    );
  } finally {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    dom.window.close();
  }
});
