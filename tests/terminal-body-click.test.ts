import test from "node:test";
import assert from "node:assert/strict";

import { handleTerminalBodyClick } from "../src/terminal/terminalBodyClick.ts";

test("terminal body click pans to terminal when the preference is enabled", () => {
  const events: string[] = [];

  handleTerminalBodyClick({
    composerEnabled: false,
    focusComposer: () => events.push("composer"),
    focusOverviewTerminal: () => events.push("overview"),
    focusXterm: () => events.push("xterm"),
    hasComposerAdapter: false,
    isOverviewMode: false,
    panToTerminalOnClick: true,
    panToTerminal: () => events.push("pan"),
  });

  assert.deepEqual(events, ["pan", "xterm"]);
});

test("terminal body click does not pan when the preference is disabled", () => {
  const events: string[] = [];

  handleTerminalBodyClick({
    composerEnabled: false,
    focusComposer: () => events.push("composer"),
    focusOverviewTerminal: () => events.push("overview"),
    focusXterm: () => events.push("xterm"),
    hasComposerAdapter: false,
    isOverviewMode: false,
    panToTerminalOnClick: false,
    panToTerminal: () => events.push("pan"),
  });

  assert.deepEqual(events, ["xterm"]);
});

test("terminal body click keeps overview behavior without panning", () => {
  const events: string[] = [];

  handleTerminalBodyClick({
    composerEnabled: false,
    focusComposer: () => events.push("composer"),
    focusOverviewTerminal: () => events.push("overview"),
    focusXterm: () => events.push("xterm"),
    hasComposerAdapter: false,
    isOverviewMode: true,
    panToTerminalOnClick: true,
    panToTerminal: () => events.push("pan"),
  });

  assert.deepEqual(events, ["overview"]);
});
