import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useSessionStore } from "../src/stores/sessionStore.ts";
import { useCanvasStore } from "../src/stores/canvasStore.ts";
import { useProjectStore } from "../src/stores/projectStore.ts";
import { useNotificationStore } from "../src/stores/notificationStore.ts";
import type { ReplayTimeline, TimelineEvent } from "../shared/sessions.ts";

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
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: window.navigator,
  });

  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async () => {},
    },
  });

  window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};

  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;

  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.IntersectionObserver =
    IntersectionObserverMock as unknown as typeof IntersectionObserver;

  return dom;
}

function event(
  index: number,
  type: TimelineEvent["type"],
  textPreview: string,
): TimelineEvent {
  return {
    index,
    type,
    textPreview,
    timestamp: `2026-05-28T00:00:0${index}.000Z`,
  };
}

function replayTimeline(): ReplayTimeline {
  return {
    sessionId: "session-1",
    projectDir: "/repo",
    filePath: "/home/user/.codex/sessions/session-1.jsonl",
    startedAt: "2026-05-28T00:00:00.000Z",
    endedAt: "2026-05-28T00:01:00.000Z",
    totalTokens: 10,
    editIndices: [],
    events: [
      event(0, "user_prompt", "First selectable prompt"),
      event(1, "assistant_text", "First selectable reply"),
      event(2, "user_prompt", "Second selectable prompt"),
      event(3, "assistant_text", "Second selectable reply"),
    ],
  };
}

async function renderReplay() {
  const dom = installDom();
  let root: Root | null = null;
  const { SessionReplayView } = await import(
    "../src/components/SessionReplayView.tsx"
  );

  useSessionStore.setState({
    panelView: "replay",
    replayTimeline: replayTimeline(),
    replayCurrentIndex: 0,
    replayIsPlaying: false,
    replaySpeed: 1,
    replayError: null,
  });
  useCanvasStore.setState({
    sessionsOverlayOpen: true,
    sessionsOverlayExpanded: true,
  });
  useProjectStore.setState({
    projects: [],
    focusedProjectId: null,
    focusedWorktreeId: null,
  });
  useNotificationStore.setState({ notifications: [] });

  const container = document.getElementById("root");
  assert.ok(container, "test root should exist");
  root = createRoot(container);

  await act(async () => {
    root?.render(<SessionReplayView />);
  });

  return {
    dom,
    root,
    async cleanup() {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      dom.window.close();
    },
  };
}

test("SessionReplayView renders prompt and assistant text outside whole-row buttons", async () => {
  const rendered = await renderReplay();
  try {
    const promptText = document.querySelector(
      '[data-testid="session-replay-user-prompt-text"]',
    );
    const replyText = document.querySelector(
      '[data-testid="session-replay-assistant-text"]',
    );

    assert.ok(promptText, "prompt text should render");
    assert.ok(replyText, "assistant text should render");
    assert.equal(
      promptText.closest("button"),
      null,
      "prompt text should not be inside a whole-row button",
    );
    assert.equal(
      replyText.closest("button"),
      null,
      "assistant text should not be inside a whole-row button",
    );
    assert.match(
      promptText.getAttribute("class") ?? "",
      /select-text/,
      "prompt text should explicitly allow text selection",
    );
    assert.match(
      replyText.getAttribute("class") ?? "",
      /select-text/,
      "assistant text should explicitly allow text selection",
    );
  } finally {
    await rendered.cleanup();
  }
});

test("PromptJumpNav calls onJump from rail and button modes", async () => {
  const { PromptJumpNav } = await import(
    "../src/components/SessionReplayPromptNav.tsx"
  );
  const dom = installDom();
  let root: Root | null = null;
  const jumped: number[] = [];

  try {
    const container = document.getElementById("root");
    assert.ok(container, "test root should exist");
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <PromptJumpNav
          items={[
            {
              id: "prompt-0",
              eventIndex: 0,
              turnIndex: 0,
              text: "First prompt",
              timestamp: "2026-05-28T00:00:00.000Z",
            },
            {
              id: "prompt-2",
              eventIndex: 2,
              turnIndex: 1,
              text: "Second prompt",
              timestamp: "2026-05-28T00:00:02.000Z",
            },
          ]}
          activePromptId="prompt-0"
          mode="rail"
          onJump={(item) => jumped.push(item.eventIndex)}
        />,
      );
    });

    const railButton = document.querySelector(
      '[aria-label="Jump to prompt 2"]',
    ) as HTMLButtonElement | null;
    assert.ok(railButton, "rail mode should render prompt buttons");
    await act(async () => {
      railButton.click();
    });
    assert.deepEqual(jumped, [2]);

    await act(async () => {
      root?.render(
        <PromptJumpNav
          items={[
            {
              id: "prompt-0",
              eventIndex: 0,
              turnIndex: 0,
              text: "First prompt",
              timestamp: "2026-05-28T00:00:00.000Z",
            },
            {
              id: "prompt-2",
              eventIndex: 2,
              turnIndex: 1,
              text: "Second prompt",
              timestamp: "2026-05-28T00:00:02.000Z",
            },
          ]}
          activePromptId="prompt-0"
          mode="button"
          onJump={(item) => jumped.push(item.eventIndex)}
        />,
      );
    });

    const trigger = document.querySelector(
      '[aria-label="Open prompt navigation"]',
    ) as HTMLButtonElement | null;
    assert.ok(trigger, "button mode should render a header trigger");
    await act(async () => {
      trigger.click();
    });

    const popoverButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Second prompt"),
    );
    assert.ok(popoverButton, "button mode popover should list prompts");
    await act(async () => {
      popoverButton.click();
    });
    assert.deepEqual(jumped, [2, 2]);
  } finally {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    dom.window.close();
  }
});
