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
  window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      width: 1100,
      height: 700,
      top: 0,
      right: 1100,
      bottom: 700,
      left: 0,
      toJSON() {
        return this;
      },
    };
  };

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

function replayTimelineWithTools(): ReplayTimeline {
  return {
    sessionId: "session-tools",
    projectDir: "/repo",
    filePath: "/home/user/.codex/sessions/session-tools.jsonl",
    startedAt: "2026-05-28T00:00:00.000Z",
    endedAt: "2026-05-28T00:01:00.000Z",
    totalTokens: 10,
    editIndices: [],
    events: [
      event(0, "user_prompt", "Prompt with tool work"),
      event(1, "tool_use", "Get-Content file"),
      event(2, "tool_result", "tool output"),
      event(3, "assistant_text", "Done"),
    ],
  };
}

async function renderReplay(timeline: ReplayTimeline = replayTimeline()) {
  const dom = installDom();
  let root: Root | null = null;
  const { SessionReplayView } = await import(
    "../src/components/SessionReplayView.tsx"
  );

  useSessionStore.setState({
    panelView: "replay",
    replayTimeline: timeline,
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
    const promptTimestamp = document.querySelector(
      '[data-testid="session-replay-prompt-timestamp"]',
    );

    assert.ok(promptText, "prompt text should render");
    assert.ok(replyText, "assistant text should render");
    assert.ok(promptTimestamp, "prompt timestamp should render");
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
    assert.match(
      promptTimestamp.getAttribute("class") ?? "",
      /select-none/,
      "prompt timestamp should not be selectable",
    );
    assert.match(
      promptTimestamp.getAttribute("class") ?? "",
      /tc-replay-selection-muted/,
      "prompt timestamp should opt out of default blue selection",
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

test("PromptJumpNav rail has a hover bridge between ticks and panel", async () => {
  const { PromptJumpNav } = await import(
    "../src/components/SessionReplayPromptNav.tsx"
  );
  const dom = installDom();
  let root: Root | null = null;

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
          onJump={() => {}}
        />,
      );
    });

    const rail = document.querySelector(
      '[data-testid="session-replay-prompt-rail"]',
    );
    assert.match(
      rail?.getAttribute("class") ?? "",
      /pr-5/,
      "rail hover target should include the horizontal bridge to the panel",
    );

    const panel = document.querySelector(
      '[data-testid="session-replay-prompt-rail-panel"]',
    );
    assert.match(
      panel?.getAttribute("class") ?? "",
      /right-0/,
      "panel should sit inside the bridged hover target without a hover gap",
    );

    const inactiveTick = document.querySelector(
      '[aria-label="Jump to prompt 2"]',
    ) as HTMLButtonElement | null;
    assert.match(
      inactiveTick?.getAttribute("class") ?? "",
      /bg-\[var\(--text-faint\)\]/,
      "rail ticks should keep a visible resting style without hard-coding inline colors",
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

test("PromptJumpNav rail keeps dense prompt lists narrow and fully represented", async () => {
  const { PromptJumpNav } = await import(
    "../src/components/SessionReplayPromptNav.tsx"
  );
  const dom = installDom();
  let root: Root | null = null;

  try {
    const container = document.getElementById("root");
    assert.ok(container, "test root should exist");
    root = createRoot(container);

    const items = Array.from({ length: 96 }, (_, index) => ({
      id: `prompt-${index}`,
      eventIndex: index,
      turnIndex: index,
      text: `Prompt ${index + 1}`,
      timestamp: `2026-05-28T00:00:${String(index).padStart(2, "0")}.000Z`,
    }));

    await act(async () => {
      root?.render(
        <PromptJumpNav
          items={items}
          activePromptId="prompt-0"
          mode="rail"
          onJump={() => {}}
        />,
      );
    });

    const tickStack = document.querySelector(
      '[data-testid="session-replay-prompt-rail-ticks"]',
    );
    assert.ok(tickStack, "rail mode should render a tick stack");
    assert.match(
      tickStack.getAttribute("class") ?? "",
      /\brelative\b/,
      "dense rail should switch to positioned ticks instead of collapsing them in a flex column",
    );

    const railTicks = tickStack.querySelectorAll("button");
    assert.equal(
      railTicks.length,
      items.length,
      "dense rail should keep every prompt represented on the rail",
    );

    const secondTick = tickStack.querySelector(
      '[aria-label="Jump to prompt 2"]',
    ) as HTMLButtonElement | null;
    assert.match(
      secondTick?.getAttribute("class") ?? "",
      /h-\[2px\]/,
      "dense rail ticks should stay thin like the original rail style",
    );
    assert.match(
      secondTick?.getAttribute("class") ?? "",
      /\bw-4\b/,
      "dense rail ticks should share the same width as the original rail style",
    );
    assert.match(
      secondTick?.getAttribute("class") ?? "",
      /\babsolute\b/,
      "dense rail ticks should be individually positioned along the rail",
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

test("PromptJumpNav button mode aligns with replay header controls", async () => {
  const { PromptJumpNav } = await import(
    "../src/components/SessionReplayPromptNav.tsx"
  );
  const dom = installDom();
  let root: Root | null = null;

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
          mode="button"
          onJump={() => {}}
        />,
      );
    });

    const wrapper = document.querySelector(
      '[data-testid="session-replay-prompt-nav-button"]',
    );
    assert.match(
      wrapper?.getAttribute("class") ?? "",
      /mt-0\.5/,
      "compact prompt nav button should align vertically with the resume button",
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

test("SessionReplayView does not flash prompt button before measuring container width", async () => {
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
  window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      width: 1100,
      height: 700,
      top: 0,
      right: 1100,
      bottom: 700,
      left: 0,
      toJSON() {
        return this;
      },
    };
  };

  class ResizeObserverDeferredMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver =
    ResizeObserverDeferredMock as unknown as typeof ResizeObserver;

  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.IntersectionObserver =
    IntersectionObserverMock as unknown as typeof IntersectionObserver;

  let root: Root | null = null;

  try {
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

    assert.equal(
      document.querySelector('[aria-label="Open prompt navigation"]'),
      null,
      "prompt button should stay hidden until container width is measured",
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

test("SessionReplayView prompt navigation jumps to a prompt and syncs replay index", async () => {
  const scrollCalls: string[] = [];
  const originalScrollIntoView = window.HTMLElement?.prototype.scrollIntoView;

  const rendered = await renderReplay();
  try {
    window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
      scrollCalls.push(this.id);
    };

    const secondPromptButton = document.querySelector(
      '[aria-label="Jump to prompt 2"]',
    ) as HTMLButtonElement | null;
    assert.ok(secondPromptButton, "prompt navigation should render");

    await act(async () => {
      secondPromptButton.click();
    });

    assert.ok(
      scrollCalls.includes("prompt-2"),
      "jump should scroll the second prompt into view",
    );
    assert.equal(
      useSessionStore.getState().replayCurrentIndex,
      2,
      "jump should keep replayCurrentIndex in sync",
    );
    assert.equal(
      document.getElementById("prompt-2")?.getAttribute("data-highlighted"),
      "true",
      "jump target should be highlighted immediately",
    );
  } finally {
    if (originalScrollIntoView) {
      window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
    await rendered.cleanup();
  }
});

test("SessionReplayView keeps copy buttons while text becomes selectable", async () => {
  const rendered = await renderReplay();
  try {
    assert.ok(
      Array.from(document.querySelectorAll("button")).some(
        (button) => button.getAttribute("aria-label") === "Copy prompt",
      ),
      "prompt copy button should remain",
    );
    assert.ok(
      Array.from(document.querySelectorAll("button")).some(
        (button) => button.getAttribute("aria-label") === "Copy reply",
      ),
      "reply copy button should remain",
    );
  } finally {
    await rendered.cleanup();
  }
});

test("SessionReplayView keeps tool chrome out of text selection", async () => {
  const rendered = await renderReplay(replayTimelineWithTools());
  try {
    const workingFold = document.querySelector(
      '[data-testid="session-replay-working-fold-toggle"]',
    );
    assert.match(
      workingFold?.getAttribute("class") ?? "",
      /select-none/,
      "working fold chrome should not be selectable",
    );

    await act(async () => {
      (workingFold as HTMLButtonElement | null)?.click();
    });

    const toolGroup = document.querySelector(
      '[data-testid="session-replay-tool-group-toggle"]',
    );
    assert.match(
      toolGroup?.getAttribute("class") ?? "",
      /select-none/,
      "tool group chrome should not be selectable",
    );

    await act(async () => {
      (toolGroup as HTMLButtonElement | null)?.click();
    });

    const toolSubItem = document.querySelector(
      '[data-testid="session-replay-tool-item-toggle"]',
    );
    assert.match(
      toolSubItem?.getAttribute("class") ?? "",
      /select-none/,
      "tool item chrome should not be selectable",
    );

    await act(async () => {
      (toolSubItem as HTMLButtonElement | null)?.click();
    });

    const inputLabel = document.querySelector(
      '[data-testid="session-replay-tool-input-label"]',
    );
    const outputLabel = document.querySelector(
      '[data-testid="session-replay-tool-output-label"]',
    );
    assert.match(
      inputLabel?.getAttribute("class") ?? "",
      /tc-replay-selection-muted/,
      "input label should opt out of default blue selection",
    );
    assert.match(
      outputLabel?.getAttribute("class") ?? "",
      /tc-replay-selection-muted/,
      "output label should opt out of default blue selection",
    );
  } finally {
    await rendered.cleanup();
  }
});
