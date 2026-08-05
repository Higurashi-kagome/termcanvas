import test from "node:test";
import assert from "node:assert/strict";

import {
  CANVAS_SURFACE_BASE_Z_INDEX,
  getCanvasSurfaceZIndex,
  isCanvasSurfaceActive,
  pushCanvasSurface,
  removeCanvasSurface,
  type CanvasSurface,
} from "../src/stores/canvasStore.ts";

test("canvas surface stack keeps the newest page on top and restores the page below", () => {
  let stack: CanvasSurface[] = [];

  stack = pushCanvasSurface(stack, "file");
  stack = pushCanvasSurface(stack, "pin");
  assert.deepEqual(stack, ["file", "pin"]);
  assert.equal(isCanvasSurfaceActive(stack, "pin"), true);
  assert.equal(isCanvasSurfaceActive(stack, "file"), false);
  assert.equal(
    getCanvasSurfaceZIndex(stack, "pin"),
    CANVAS_SURFACE_BASE_Z_INDEX + 1,
  );

  stack = removeCanvasSurface(stack, "pin");
  assert.deepEqual(stack, ["file"]);
  assert.equal(isCanvasSurfaceActive(stack, "file"), true);

  stack = pushCanvasSurface(stack, "file");
  assert.deepEqual(stack, ["file"]);
});
