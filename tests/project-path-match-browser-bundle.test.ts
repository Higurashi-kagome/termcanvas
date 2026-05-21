import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { build } from "esbuild";

test("project path match helper can be bundled for the browser", async () => {
  await assert.doesNotReject(async () => {
    await build({
      entryPoints: [
        path.join(process.cwd(), "shared", "project-path-match.ts"),
      ],
      bundle: true,
      format: "esm",
      platform: "browser",
      write: false,
    });
  });
});
