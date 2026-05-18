import test from "node:test";
import assert from "node:assert/strict";

import { normalizeProjectPathForMatch } from "../shared/project-path-match.ts";

test("normalizeProjectPathForMatch treats Windows slash variants as the same path", () => {
  assert.equal(
    normalizeProjectPathForMatch("E:\\GitHub\\blog-site"),
    normalizeProjectPathForMatch("E:/GitHub/blog-site"),
  );
});

test("normalizeProjectPathForMatch preserves POSIX case sensitivity", () => {
  assert.notEqual(
    normalizeProjectPathForMatch("/Users/Alice/Repo"),
    normalizeProjectPathForMatch("/users/alice/repo"),
  );
});
