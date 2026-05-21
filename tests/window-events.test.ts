import test from "node:test";
import assert from "node:assert/strict";

import { canSendToWindow, sendToWindow } from "../electron/window-events.ts";

test("sendToWindow sends when window and webContents are alive", () => {
  const sent: unknown[][] = [];
  const win = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: (...args: unknown[]) => sent.push(args),
    },
  };

  const delivered = sendToWindow(win, "terminal:exit", 1, 0);

  assert.equal(delivered, true);
  assert.deepEqual(sent, [["terminal:exit", 1, 0]]);
});

test("canSendToWindow is false after BrowserWindow is destroyed", () => {
  const win = {
    isDestroyed: () => true,
    webContents: {
      isDestroyed: () => false,
      send: () => {
        throw new Error("should not send");
      },
    },
  };

  assert.equal(canSendToWindow(win), false);
  assert.equal(sendToWindow(win, "terminal:exit", 1, 0), false);
});

test("canSendToWindow is false after webContents is destroyed", () => {
  const win = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => true,
      send: () => {
        throw new Error("should not send");
      },
    },
  };

  assert.equal(canSendToWindow(win), false);
  assert.equal(sendToWindow(win, "terminal:output", 1, "hi"), false);
});

test("sendToWindow returns false when webContents.send throws", () => {
  const win = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: () => {
        const error = Object.assign(new Error("broken pipe"), {
          code: "EPIPE",
        });
        throw error;
      },
    },
  };

  assert.equal(sendToWindow(win, "sessions:list-changed", []), false);
});

test("sendToWindow rethrows unexpected webContents.send errors", () => {
  const win = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: () => {
        throw new Error("serialization failed");
      },
    },
  };

  assert.throws(() => sendToWindow(win, "sessions:list-changed", []), {
    message: "serialization failed",
  });
});
