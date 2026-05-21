import assert from "node:assert/strict";
import test from "node:test";

import { getAppDataDirName, isDevInstall } from "../electron/app-flavor.ts";

test("dev server uses termcanvas-dev data dir", () => {
  assert.equal(getAppDataDirName("termcanvas", true), "termcanvas-dev");
  assert.equal(isDevInstall("termcanvas", true), true);
});

test("release app name maps to stable slug", () => {
  assert.equal(getAppDataDirName("TermCanvas", false), "termcanvas");
  assert.equal(isDevInstall("TermCanvas", false), false);
});

test("dev app name gets isolated slug and flavor", () => {
  assert.equal(getAppDataDirName("TermCanvas Dev", false), "termcanvas-dev");
  assert.equal(isDevInstall("TermCanvas Dev", false), true);
});

test("packaged dev flavor forces isolated data dir even with release app name", () => {
  assert.equal(getAppDataDirName("termcanvas", false, "dev"), "termcanvas-dev");
  assert.equal(isDevInstall("termcanvas", false, "dev"), true);
});
