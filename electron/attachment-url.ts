import { fileURLToPath, pathToFileURL } from "node:url";

const TC_ATTACHMENT_SCHEME = "tc-attachment:";
const TC_ATTACHMENT_HOST = "local";

export function buildTcAttachmentBaseUrl(dirPath: string): string {
  const fileUrl = pathToFileURL(dirPath);
  return `tc-attachment://local${fileUrl.pathname}`.replace(/\/$/, "");
}

export function resolveTcAttachmentRequestPath(requestUrl: string): string {
  const url = new URL(requestUrl);
  if (url.protocol !== TC_ATTACHMENT_SCHEME) {
    throw new Error(`Unsupported attachment protocol: ${url.protocol}`);
  }
  if (url.hostname !== TC_ATTACHMENT_HOST) {
    throw new Error(`Unsupported attachment host: ${url.hostname}`);
  }
  return fileURLToPath(new URL(`file://${url.pathname}`));
}
