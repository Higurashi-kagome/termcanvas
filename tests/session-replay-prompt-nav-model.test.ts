import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPromptJumpItems,
  getPromptNavMode,
  shouldRenderPromptJumpNav,
} from "../src/components/sessionReplayPromptNavModel.ts";
import type { TimelineEvent } from "../shared/sessions.ts";

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

test("buildPromptJumpItems skips headless turns and keeps timeline indices", () => {
  const items = buildPromptJumpItems([
    {
      startIndex: 0,
      userEvent: null,
    },
    {
      startIndex: 2,
      userEvent: event(2, "user_prompt", "First prompt"),
    },
    {
      startIndex: 5,
      userEvent: event(5, "user_prompt", "Second prompt"),
    },
  ]);

  assert.deepEqual(items, [
    {
      id: "prompt-2",
      eventIndex: 2,
      turnIndex: 0,
      text: "First prompt",
      timestamp: "2026-05-28T00:00:02.000Z",
    },
    {
      id: "prompt-5",
      eventIndex: 5,
      turnIndex: 1,
      text: "Second prompt",
      timestamp: "2026-05-28T00:00:05.000Z",
    },
  ]);
});

test("buildPromptJumpItems filters synthetic prompt-nav noise and adjacent duplicates", () => {
  const items = buildPromptJumpItems([
    {
      startIndex: 0,
      userEvent: event(0, "user_prompt", "<subagent_notification>worker</subagent_notification>"),
    },
    {
      startIndex: 1,
      userEvent: event(1, "user_prompt", "<image name=[Image #1]>"),
    },
    {
      startIndex: 2,
      userEvent: event(2, "user_prompt", "Real prompt"),
    },
    {
      startIndex: 3,
      userEvent: {
        ...event(3, "user_prompt", "Real prompt"),
        timestamp: "2026-05-28T00:00:02.000Z",
      },
    },
    {
      startIndex: 4,
      userEvent: event(
        4,
        "user_prompt",
        "<image name=[Image #2]>\nPrompt with image context",
      ),
    },
  ]);

  assert.deepEqual(items, [
    {
      id: "prompt-2",
      eventIndex: 2,
      turnIndex: 0,
      text: "Real prompt",
      timestamp: "2026-05-28T00:00:02.000Z",
    },
    {
      id: "prompt-4",
      eventIndex: 4,
      turnIndex: 1,
      text: "Prompt with image context",
      timestamp: "2026-05-28T00:00:04.000Z",
    },
  ]);
});

test("shouldRenderPromptJumpNav hides zero and one prompt sessions", () => {
  assert.equal(shouldRenderPromptJumpNav([]), false);
  assert.equal(
    shouldRenderPromptJumpNav([
      {
        id: "prompt-1",
        eventIndex: 1,
        turnIndex: 0,
        text: "Only prompt",
        timestamp: "2026-05-28T00:00:01.000Z",
      },
    ]),
    false,
  );
  assert.equal(
    shouldRenderPromptJumpNav([
      {
        id: "prompt-1",
        eventIndex: 1,
        turnIndex: 0,
        text: "First",
        timestamp: "2026-05-28T00:00:01.000Z",
      },
      {
        id: "prompt-2",
        eventIndex: 2,
        turnIndex: 1,
        text: "Second",
        timestamp: "2026-05-28T00:00:02.000Z",
      },
    ]),
    true,
  );
});

test("getPromptNavMode uses drawer width, not window width", () => {
  assert.equal(getPromptNavMode(1100), "rail");
  assert.equal(getPromptNavMode(860), "railCompact");
  assert.equal(getPromptNavMode(640), "button");
});
