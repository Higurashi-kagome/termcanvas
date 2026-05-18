import test from "node:test";
import assert from "node:assert/strict";

import { installBrokenPipeGuards } from "../electron/process-stream-guards.ts";

class FakeStream {
  private listeners: Array<(error: unknown) => void> = [];
  writeImpl: (...args: unknown[]) => unknown = () => true;

  on(event: "error", listener: (error: unknown) => void) {
    assert.equal(event, "error");
    this.listeners.push(listener);
  }

  write(...args: unknown[]) {
    return this.writeImpl(...args);
  }

  emit(error: unknown) {
    for (const listener of this.listeners) {
      listener(error);
    }
  }
}

test("installBrokenPipeGuards swallows EPIPE stream errors", () => {
  const stream = new FakeStream();
  const scheduled: Error[] = [];
  installBrokenPipeGuards([stream], {
    scheduleThrow: (error) => {
      scheduled.push(error);
    },
  });

  const error = Object.assign(new Error("broken pipe"), { code: "EPIPE" });
  assert.doesNotThrow(() => {
    stream.emit(error);
  });
  assert.deepEqual(scheduled, []);
});

test("installBrokenPipeGuards rethrows non-EPIPE stream errors", () => {
  const stream = new FakeStream();
  const scheduled: Error[] = [];
  installBrokenPipeGuards([stream], {
    scheduleThrow: (error) => {
      scheduled.push(error);
    },
  });

  const error = new Error("unexpected failure");
  stream.emit(error);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0], error);
});

test("installBrokenPipeGuards swallows synchronous EPIPE write errors", () => {
  const stream = new FakeStream();
  installBrokenPipeGuards([stream]);
  stream.writeImpl = () => {
    throw Object.assign(new Error("broken pipe"), { code: "EPIPE" });
  };

  assert.equal(stream.write("chunk"), false);
});
