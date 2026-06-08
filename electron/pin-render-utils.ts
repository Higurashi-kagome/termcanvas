import path from "node:path";
import fs from "node:fs";
import { marked } from "marked";
import type { Pin } from "../shared/pin";

export const PIN_RENDER_DEFAULT_WIDTH = 1280;
export const PIN_RENDER_DEFAULT_HEIGHT = 900;
export const PIN_RENDER_MIN_WIDTH = 320;
export const PIN_RENDER_MIN_HEIGHT = 240;
export const PIN_RENDER_MAX_WIDTH = 3840;
export const PIN_RENDER_MAX_HEIGHT = 4096;
export const PIN_RENDER_DEFAULT_WAIT_MS = 300;
export const PIN_RENDER_MAX_WAIT_MS = 5000;
export const PIN_RENDER_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const HTML_DOCUMENT_RE =
  /^\s*(?:<!doctype\s+html[^>]*>|<html[\s>]|<head[\s>]|<body[\s>])/i;
const PIN_RENDER_CSP = [
  "default-src 'none'",
  "img-src data: blob: http: https: tc-attachment:",
  "media-src data: blob: http: https: tc-attachment:",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "font-src data:",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export interface PinRenderOptionsInput {
  outputPath?: string;
  width?: unknown;
  height?: unknown;
  waitMs?: unknown;
  fullPage?: unknown;
}

export interface NormalizedPinRenderOptions {
  outputPath: string;
  width: number;
  height: number;
  waitMs: number;
  fullPage: boolean;
}

export type PinRenderTheme = "dark" | "light";

export interface PinRenderHtmlOptions {
  theme?: PinRenderTheme;
  interactivePreview?: boolean;
}

export function isPinHtmlDocument(text: string): boolean {
  return HTML_DOCUMENT_RE.test(text);
}

export function getDefaultPinRenderPath(repo: string, pinId: string): string {
  return path.join(getPinRenderCacheDir(repo), pinId, "latest.png");
}

export function getPinRenderCacheDir(repo: string): string {
  return path.join(repo, ".termcanvas", "pin-renders");
}

export function cleanupPinRenderCache(
  repo: string,
  existingPinIds: Iterable<string>,
  nowMs = Date.now(),
): void {
  const cacheDir = getPinRenderCacheDir(repo);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(cacheDir, { withFileTypes: true });
  } catch {
    return;
  }

  const existing = new Set(existingPinIds);
  for (const entry of entries) {
    const fullPath = path.join(cacheDir, entry.name);
    if (!entry.isDirectory()) {
      removeIfStaleRenderFile(fullPath, nowMs);
      continue;
    }
    if (!existing.has(entry.name)) {
      removePath(fullPath);
      continue;
    }
    cleanupPinRenderDir(fullPath, nowMs);
  }
  removeEmptyDir(cacheDir);
}

export function normalizePinRenderOptions(
  repo: string,
  pinId: string,
  input: PinRenderOptionsInput = {},
): NormalizedPinRenderOptions {
  return {
    outputPath: path.resolve(
      typeof input.outputPath === "string" && input.outputPath.trim()
        ? input.outputPath
        : getDefaultPinRenderPath(repo, pinId),
    ),
    width: clampInteger(
      input.width,
      PIN_RENDER_DEFAULT_WIDTH,
      PIN_RENDER_MIN_WIDTH,
      PIN_RENDER_MAX_WIDTH,
    ),
    height: clampInteger(
      input.height,
      PIN_RENDER_DEFAULT_HEIGHT,
      PIN_RENDER_MIN_HEIGHT,
      PIN_RENDER_MAX_HEIGHT,
    ),
    waitMs: clampInteger(
      input.waitMs,
      PIN_RENDER_DEFAULT_WAIT_MS,
      0,
      PIN_RENDER_MAX_WAIT_MS,
    ),
    fullPage: input.fullPage === true,
  };
}

export function buildPinRenderHtml(
  pin: Pin,
  options: PinRenderHtmlOptions = {},
): string {
  const baseUrl = normalizeAttachmentsUrl(pin.attachmentsUrl);
  const previewHeadInner = buildPreviewHeadInner(pin.title || "Pin", options);
  if (isPinHtmlDocument(pin.body)) {
    return prepareHtmlDocument(
      pin.body,
      baseUrl,
      options.theme,
      previewHeadInner,
    );
  }

  const rendered = marked.parse(pin.body, {
    async: false,
    breaks: true,
  }) as string;
  const body = rewriteRelativeAttachmentMedia(rendered, baseUrl);
  const previewHead = `<head>${previewHeadInner}</head>`;
  return [
    "<!doctype html>",
    `<html lang="en"${options.theme ? ` data-termcanvas-theme="${options.theme}"` : ""}>`,
    previewHead,
    `<body><main>${body}</main></body>`,
    "</html>",
  ].join("");
}

function prepareHtmlDocument(
  text: string,
  baseUrl: string | null,
  theme: PinRenderTheme | undefined,
  previewHeadInner: string,
): string {
  let html = text;
  html = html.replace(/<base\b[^>]*>/gi, "");
  html = html.replace(
    /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi,
    "",
  );
  html = rewriteRelativeAttachmentMedia(html, baseUrl);
  html = applyPreviewThemeToHtmlTag(html, theme);

  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b([^>]*)>/i, `<head$1>${previewHeadInner}`);
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(
      /<html\b([^>]*)>/i,
      `<html$1><head>${previewHeadInner}</head>`,
    );
  }
  return `<!doctype html><html${theme ? ` data-termcanvas-theme="${theme}"` : ""}><head>${previewHeadInner}</head>${html}</html>`;
}

function rewriteRelativeAttachmentMedia(
  html: string,
  baseUrl: string | null,
): string {
  if (!baseUrl) return html;
  return html.replace(
    /\b(src|poster|href)\s*=\s*(["'])(\.\/[^"']+)\2/gi,
    (full, attr: string, quote: string, value: string) => {
      const resolved = resolveAttachmentHref(value, baseUrl);
      return resolved === value ? full : `${attr}=${quote}${escapeAttr(resolved)}${quote}`;
    },
  );
}

function resolveAttachmentHref(href: string, baseUrl: string | null): string {
  if (!baseUrl) return href;
  if (!href.startsWith("./")) return href;
  const segments = href.slice(2).split("/");
  const basename = segments[segments.length - 1];
  if (!basename) return href;
  return `${baseUrl}/${encodeURIComponent(basename)}`;
}

function normalizeAttachmentsUrl(attachmentsUrl: string | undefined): string | null {
  return attachmentsUrl ? attachmentsUrl.replace(/\/$/, "") : null;
}

function cleanupPinRenderDir(dir: string, nowMs: number): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      cleanupPinRenderDir(fullPath, nowMs);
      removeEmptyDir(fullPath);
      continue;
    }
    if (entry.name === "latest.png" || entry.name === "latest.json") {
      continue;
    }
    removeIfStaleRenderFile(fullPath, nowMs);
  }
  removeEmptyDir(dir);
}

function removeIfStaleRenderFile(filePath: string, nowMs: number): void {
  const name = path.basename(filePath);
  if (!isRenderCacheFileName(name)) return;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return;
  }
  if (!stat.isFile()) return;
  if (name.includes(".tmp-") || nowMs - stat.mtimeMs > PIN_RENDER_CACHE_MAX_AGE_MS) {
    removePath(filePath);
  }
}

function isRenderCacheFileName(name: string): boolean {
  return (
    name === "latest.json" ||
    name.endsWith(".png") ||
    name.endsWith(".json") ||
    name.includes(".tmp-")
  );
}

function removePath(targetPath: string): void {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch {
    // Cache cleanup should not block rendering.
  }
}

function removeEmptyDir(dir: string): void {
  try {
    fs.rmdirSync(dir);
  } catch {
    // Directory is not empty or disappeared; both are fine for cleanup.
  }
}

function clampInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function pinRenderCspMeta(): string {
  return `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(
    PIN_RENDER_CSP,
  )}">`;
}

function buildPreviewHeadInner(
  title: string,
  options: PinRenderHtmlOptions,
): string {
  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    pinRenderCspMeta(),
    `<title>${escapeHtml(title)}</title>`,
    `<style>${buildPreviewStyles(options.theme)}</style>`,
    options.interactivePreview ? `<script>${previewBridgeScript()}</script>` : "",
  ].join("");
}

function buildPreviewStyles(theme: PinRenderTheme | undefined): string {
  if (theme === "light") {
    return basePreviewStyles(
      "#eae8e4",
      "#f3f2ef",
      "#e5e3df",
      "#dbd8d3",
      "#1c1917",
      "#57534e",
      "#44403c",
      "rgba(28, 25, 23, 0.42)",
    );
  }
  if (theme === "dark") {
    return basePreviewStyles(
      "#1a1918",
      "#222120",
      "#2a2928",
      "#333231",
      "#e4e2df",
      "#918e89",
      "#c4c0b8",
      "rgba(0, 0, 0, 0.55)",
    );
  }
  return [
    "body{margin:0;background:#fff;color:#111;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}",
    "main{box-sizing:border-box;max-width:840px;margin:0 auto;padding:32px;}",
    "img,svg,video,canvas{max-width:100%;height:auto;}",
    "pre{overflow:auto;padding:12px;background:#f6f8fa;border-radius:6px;}",
    "code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}",
    "table{border-collapse:collapse;width:100%;}",
    "td,th{border:1px solid #d0d7de;padding:6px 8px;}",
    ".fancybox__backdrop{background:rgba(0,0,0,0.55)!important;}",
  ].join("");
}

function basePreviewStyles(
  bg: string,
  surface: string,
  surfaceHover: string,
  border: string,
  text: string,
  textMuted: string,
  accent: string,
  scrim: string,
): string {
  return [
    `:root{--tc-preview-bg:${bg};--tc-preview-surface:${surface};--tc-preview-surface-hover:${surfaceHover};--tc-preview-border:${border};--tc-preview-text:${text};--tc-preview-text-muted:${textMuted};--tc-preview-accent:${accent};--tc-preview-scrim:${scrim};}`,
    `html[data-termcanvas-theme="light"],html[data-termcanvas-theme="dark"]{color-scheme:${bg === "#eae8e4" ? "light" : "dark"};}`,
    "body{margin:0;background:var(--tc-preview-bg);color:var(--tc-preview-text);font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}",
    "main{box-sizing:border-box;max-width:840px;margin:0 auto;padding:32px;}",
    "a{color:var(--tc-preview-accent);}",
    "img,svg,video,canvas{max-width:100%;height:auto;}",
    "img{border-radius:8px;border:1px solid var(--tc-preview-border);background:var(--tc-preview-surface);}",
    "pre{overflow:auto;padding:12px;background:var(--tc-preview-surface);border:1px solid var(--tc-preview-border);border-radius:8px;}",
    "code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}",
    "table{border-collapse:collapse;width:100%;}",
    "td,th{border:1px solid var(--tc-preview-border);padding:6px 8px;}",
    "th{background:var(--tc-preview-surface-hover);}",
    "blockquote{border-left:3px solid var(--tc-preview-border);margin-left:0;padding-left:14px;color:var(--tc-preview-text-muted);}",
    ".fancybox__backdrop{background:var(--tc-preview-scrim)!important;}",
    ".fancybox__container,.fancybox__toolbar,.fancybox__footer,.fancybox__caption{color:var(--tc-preview-text)!important;}",
    ".fancybox__toolbar,.fancybox__footer{background:color-mix(in srgb,var(--tc-preview-bg) 88%,transparent)!important;}",
    ".f-button{background:var(--tc-preview-surface)!important;color:var(--tc-preview-text)!important;border:1px solid var(--tc-preview-border)!important;}",
    ".f-button:hover{background:var(--tc-preview-surface-hover)!important;}",
  ].join("");
}

function previewBridgeScript(): string {
  return [
    "(function(){",
    "  function closePreview(){",
    "    try {",
    "      var fancybox = window.Fancybox;",
    "      if (!fancybox) return false;",
    "      var instance = typeof fancybox.getInstance === 'function' ? fancybox.getInstance() : null;",
    "      if (instance && typeof instance.close === 'function') { instance.close(); return true; }",
    "      if (typeof fancybox.close === 'function') { fancybox.close(); return true; }",
    "    } catch {}",
    "    return false;",
    "  }",
    "  document.addEventListener('keydown', function(event){",
    "    if (event.key !== 'Escape') return;",
    "    if (!closePreview()) return;",
    "    event.preventDefault();",
    "    event.stopPropagation();",
    "  }, true);",
    "  document.addEventListener('click', function(event){",
    "    var target = event.target;",
    "    if (!(target instanceof Element)) return;",
    "    if (target.closest('[data-fancybox-close], .fancybox__backdrop')) {",
    "      if (closePreview()) { event.preventDefault(); event.stopPropagation(); }",
    "      return;",
    "    }",
    "    var container = target.closest('.fancybox__container');",
    "    if (!container) return;",
    "    if (target.closest('.fancybox__content, .fancybox__toolbar, .fancybox__footer, .fancybox__nav, .f-button')) return;",
    "    if (closePreview()) { event.preventDefault(); event.stopPropagation(); }",
    "  }, true);",
    "})();",
  ].join("");
}

function applyPreviewThemeToHtmlTag(
  html: string,
  theme: PinRenderTheme | undefined,
): string {
  if (!theme) return html;
  return html.replace(/<html\b([^>]*)>/i, (_full, attrs: string) => {
    if (/data-termcanvas-theme\s*=/.test(attrs)) {
      return `<html${attrs}>`;
    }
    return `<html${attrs} data-termcanvas-theme="${theme}">`;
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
