import test from "node:test";
import assert from "node:assert/strict";

test("attachWorktreeFocusRefresh triggers a lightweight refresh on window focus", async () => {
  const mod = await import(
    `../src/hooks/useWorktreeFiles.ts?focus-${Date.now()}`
  );

  assert.equal(typeof mod.attachWorktreeFocusRefresh, "function");

  const listeners = new Map<string, EventListener>();
  const target = {
    addEventListener(eventName: string, listener: EventListener) {
      listeners.set(eventName, listener);
    },
    removeEventListener(eventName: string, listener: EventListener) {
      if (listeners.get(eventName) === listener) {
        listeners.delete(eventName);
      }
    },
  };

  const calls: Array<Record<string, unknown> | undefined> = [];
  const detach = mod.attachWorktreeFocusRefresh(
    target,
    "/repo",
    (options?: Record<string, unknown>) => {
      calls.push(options);
      return Promise.resolve();
    },
  );

  const focusListener = listeners.get("focus");
  assert.equal(typeof focusListener, "function");
  focusListener?.(new Event("focus"));
  await Promise.resolve();

  assert.deepEqual(calls, [{ includeIgnored: false }]);

  detach();
  assert.equal(listeners.has("focus"), false);
});
