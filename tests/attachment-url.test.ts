import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  buildTcAttachmentBaseUrl,
  resolveTcAttachmentRequestPath,
} from "../electron/attachment-url.ts";

test("tc-attachment URLs round-trip to the original file path", () => {
  const basePath =
    process.platform === "win32"
      ? "E:\\repo\\.termcanvas\\pins\\pin-aa11.attachments"
      : "/tmp/repo/.termcanvas/pins/pin-aa11.attachments";
  const expected = path.join(basePath, "shot.png");
  const requestUrl = `${buildTcAttachmentBaseUrl(basePath)}/shot.png`;

  assert.equal(resolveTcAttachmentRequestPath(requestUrl), expected);
});

test("windows tc-attachment path does not duplicate the drive letter", () => {
  if (process.platform !== "win32") return;

  const requestUrl =
    "tc-attachment://local/E:/repo/.termcanvas/pins/pin-aa11.attachments/shot.png";

  assert.equal(
    resolveTcAttachmentRequestPath(requestUrl),
    "E:\\repo\\.termcanvas\\pins\\pin-aa11.attachments\\shot.png",
  );
});
