import { Marked } from "marked";
import DOMPurify from "dompurify";

const ALLOWED_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|xxx|urn|tc-attachment):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;
const PIN_HTML_CSP = [
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
const HTML_DOCUMENT_RE =
  /^\s*(?:<!doctype\s+html[^>]*>|<html[\s>]|<head[\s>]|<body[\s>])/i;
type PreviewTheme = "dark" | "light";

function sanitizeHtml(html: string): string {
  const purifier =
    typeof window === "undefined" ? DOMPurify : DOMPurify(window);
  return purifier.sanitize(html, {
    ALLOWED_URI_REGEXP,
    ADD_ATTR: ["target"],
  });
}

export const MARKDOWN_FILE_HREF_ATTR = "data-tc-file-href";

export function isHttpMarkdownHref(href: string): boolean {
  return /^(?:https?:\/\/|\/\/)/i.test(href.trim());
}

export function isLocalMarkdownHref(href: string): boolean {
  const value = href.trim();
  if (!value || value.startsWith("#") || value.startsWith("?")) return false;
  if (isHttpMarkdownHref(value)) return false;
  if (/^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value)) return true;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    return /^(?:file|sandbox):/i.test(value);
  }
  return true;
}

export const markdownClassName =
  "prose prose-sm prose-invert max-w-none text-[length:var(--text-md)] leading-relaxed text-[var(--text-primary)] " +
  "[&_h1]:text-[15px] [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1.5 " +
  "[&_h2]:text-[length:var(--text-md)] [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 " +
  "[&_h3]:text-[length:var(--text-base)] [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 " +
  "[&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 " +
  "[&_a]:text-[var(--accent)] [&_a]:cursor-pointer " +
  "[&_code]:text-[var(--text-primary)] [&_code]:bg-[var(--surface)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[length:var(--text-xs)] [&_code]:break-words " +
  "[&_pre]:bg-[var(--surface)] [&_pre]:rounded-md [&_pre]:p-2.5 [&_pre]:text-[length:var(--text-xs)] [&_pre]:overflow-x-auto [&_pre]:min-w-0 " +
  "[&_p]:break-words [&_li]:break-words [&_h1]:break-words [&_h2]:break-words [&_h3]:break-words [&_a]:break-all " +
  "[&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full [&_table]:min-w-0 " +
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border-hover)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--text-muted)] " +
  "[&_hr]:border-[var(--border)] " +
  "[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-md [&_img]:border [&_img]:border-[var(--border)] [&_img]:my-2";

const sessionMarkdown = new Marked({
  async: false,
  breaks: true,
  renderer: {
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
      if (isLocalMarkdownHref(href)) {
        return `<a href="#" ${MARKDOWN_FILE_HREF_ATTR}="${escapeAttr(href)}"${titleAttr}>${text}</a>`;
      }

      const safeHref = escapeAttr(href);
      const externalAttrs = isHttpMarkdownHref(href)
        ? ' target="_blank" rel="noopener noreferrer"'
        : "";
      return `<a href="${safeHref}"${externalAttrs}${titleAttr}>${text}</a>`;
    },
    image({ href, title, text, tokens }) {
      const alt = tokens
        ? this.parser.parseInline(tokens, this.parser.textRenderer)
        : text ?? "";
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
      if (isLocalMarkdownHref(href)) {
        const label = escapeAttr(alt || href);
        return `<a href="#" ${MARKDOWN_FILE_HREF_ATTR}="${escapeAttr(href)}" data-tc-file-image="true"${titleAttr}>${label}</a>`;
      }

      const safeHref = escapeAttr(href);
      const safeAlt = escapeAttr(alt);
      const img = `<img src="${safeHref}" alt="${safeAlt}"${titleAttr} loading="lazy" />`;
      return isHttpMarkdownHref(href)
        ? `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${img}</a>`
        : img;
    },
  },
});

export function renderMarkdown(text: string): string {
  const html = sessionMarkdown.parse(text) as string;
  return sanitizeHtml(html);
}

export function renderMarkdownWithAttachments(
  text: string,
  attachmentsUrl: string | undefined,
): string {
  const baseUrl = normalizeAttachmentsUrl(attachmentsUrl);
  const m = new Marked({
    async: false,
    breaks: true,
    renderer: {
      image({ href, title, text: alt }) {
        const resolved = resolveAttachmentHref(href, baseUrl);
        const safeHref = escapeAttr(resolved);
        const safeAlt = escapeAttr(alt ?? "");
        const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
        const img = `<img src="${safeHref}" alt="${safeAlt}"${titleAttr} loading="lazy" />`;
        return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${img}</a>`;
      },
    },
  });
  const html = sanitizeHtml(m.parse(text) as string);
  return rewriteRelativeAttachmentMedia(html, baseUrl);
}

export function isHtmlDocument(text: string): boolean {
  return HTML_DOCUMENT_RE.test(text);
}

export function renderHtmlDocumentWithAttachments(
  text: string,
  attachmentsUrl: string | undefined,
): string {
  const theme = getPreviewTheme();
  const previewHeadInner = buildHtmlPreviewHeadInner(theme);
  const parsed = parseHtmlDocument(text);
  if (!parsed) {
    return `<!doctype html><html data-termcanvas-theme="${theme}"><head>${previewHeadInner}</head><body>${sanitizeHtml(
      text,
    )}</body></html>`;
  }

  parsed.querySelectorAll("base").forEach((el) => el.remove());
  const head = parsed.head;
  head
    .querySelectorAll("meta[http-equiv]")
    .forEach((el) => {
      if (
        el
          .getAttribute("http-equiv")
          ?.toLowerCase()
          .trim() === "content-security-policy"
      ) {
        el.remove();
      }
    });
  parsed.documentElement.setAttribute("data-termcanvas-theme", theme);
  head.insertAdjacentHTML("afterbegin", previewHeadInner);
  rewriteRelativeAttachmentMediaInRoot(
    parsed,
    normalizeAttachmentsUrl(attachmentsUrl),
  );

  return `<!doctype html>\n${parsed.documentElement.outerHTML}`;
}

function normalizeAttachmentsUrl(attachmentsUrl: string | undefined): string | null {
  return attachmentsUrl ? attachmentsUrl.replace(/\/$/, "") : null;
}

function resolveAttachmentHref(href: string, baseUrl: string | null): string {
  if (!baseUrl) return href;
  if (!href.startsWith("./")) return href;
  const segments = href.slice(2).split("/");
  const basename = segments[segments.length - 1];
  if (!basename) return href;
  return `${baseUrl}/${encodeURIComponent(basename)}`;
}

function rewriteRelativeAttachmentMedia(
  html: string,
  baseUrl: string | null,
): string {
  if (!baseUrl) return html;
  const doc = getDocument();
  if (!doc) return html;
  const template = doc.createElement("template");
  template.innerHTML = html;
  rewriteRelativeAttachmentMediaInRoot(template.content, baseUrl);
  return template.innerHTML;
}

function rewriteRelativeAttachmentMediaInRoot(
  root: ParentNode,
  baseUrl: string | null,
): void {
  if (!baseUrl) return;
  root.querySelectorAll("img[src], source[src], video[poster]").forEach((node) => {
    const el = node as Element;
    for (const attr of ["src", "poster"]) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      const resolved = resolveAttachmentHref(value, baseUrl);
      if (resolved === value) continue;
      el.setAttribute(attr, resolved);
      const parent = el.parentElement;
      if (
        parent?.tagName.toLowerCase() === "a" &&
        parent.getAttribute("href") === value
      ) {
        parent.setAttribute("href", resolved);
      }
    }
    if (el.tagName.toLowerCase() === "img" && !el.hasAttribute("loading")) {
      el.setAttribute("loading", "lazy");
    }
  });
}

function parseHtmlDocument(text: string): Document | null {
  const Parser =
    typeof DOMParser !== "undefined"
      ? DOMParser
      : (getWindow() as
          | (Window & { DOMParser?: typeof DOMParser })
          | undefined)?.DOMParser;
  if (!Parser) return null;
  return new Parser().parseFromString(text, "text/html");
}

function getDocument(): Document | null {
  if (typeof document !== "undefined") return document;
  return getWindow()?.document ?? null;
}

function getWindow(): Window | undefined {
  return (globalThis as typeof globalThis & { window?: Window }).window;
}

function pinHtmlCspMeta(): string {
  return `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(
    PIN_HTML_CSP,
  )}">`;
}

function getPreviewTheme(): PreviewTheme {
  const doc = getDocument();
  const attr = doc?.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  try {
    const saved = getWindow()?.localStorage?.getItem("termcanvas-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {}
  return "dark";
}

function buildHtmlPreviewHeadInner(theme: PreviewTheme): string {
  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    pinHtmlCspMeta(),
    `<style>${buildHtmlPreviewStyles(theme)}</style>`,
    `<script>${buildHtmlPreviewBridgeScript()}</script>`,
  ].join("");
}

function buildHtmlPreviewStyles(theme: PreviewTheme): string {
  if (theme === "light") {
    return [
      ':root{--tc-preview-bg:#eae8e4;--tc-preview-surface:#f3f2ef;--tc-preview-surface-hover:#e5e3df;--tc-preview-border:#dbd8d3;--tc-preview-text:#1c1917;--tc-preview-text-muted:#57534e;--tc-preview-accent:#44403c;--tc-preview-scrim:rgba(28,25,23,0.42);}',
      'html[data-termcanvas-theme="light"]{color-scheme:light;}',
      "body{background:var(--tc-preview-bg);color:var(--tc-preview-text);}",
      "a{color:var(--tc-preview-accent);}",
      "img{border-radius:8px;border:1px solid var(--tc-preview-border);background:var(--tc-preview-surface);}",
      "pre,code,kbd,samp{background:var(--tc-preview-surface);}",
      "table,td,th{border-color:var(--tc-preview-border);}",
      "th{background:var(--tc-preview-surface-hover);}",
      ".fancybox__backdrop{background:var(--tc-preview-scrim)!important;}",
      ".fancybox__container,.fancybox__toolbar,.fancybox__footer,.fancybox__caption{color:var(--tc-preview-text)!important;}",
      ".fancybox__toolbar,.fancybox__footer{background:color-mix(in srgb,var(--tc-preview-bg) 88%,transparent)!important;}",
      ".f-button{background:var(--tc-preview-surface)!important;color:var(--tc-preview-text)!important;border:1px solid var(--tc-preview-border)!important;}",
      ".f-button:hover{background:var(--tc-preview-surface-hover)!important;}",
    ].join("");
  }
  return [
    ':root{--tc-preview-bg:#1a1918;--tc-preview-surface:#222120;--tc-preview-surface-hover:#2a2928;--tc-preview-border:#333231;--tc-preview-text:#e4e2df;--tc-preview-text-muted:#918e89;--tc-preview-accent:#c4c0b8;--tc-preview-scrim:rgba(0,0,0,0.55);}',
    'html[data-termcanvas-theme="dark"]{color-scheme:dark;}',
    "body{background:var(--tc-preview-bg);color:var(--tc-preview-text);}",
    "a{color:var(--tc-preview-accent);}",
    "img{border-radius:8px;border:1px solid var(--tc-preview-border);background:var(--tc-preview-surface);}",
    "pre,code,kbd,samp{background:var(--tc-preview-surface);}",
    "table,td,th{border-color:var(--tc-preview-border);}",
    "th{background:var(--tc-preview-surface-hover);}",
    ".fancybox__backdrop{background:var(--tc-preview-scrim)!important;}",
    ".fancybox__container,.fancybox__toolbar,.fancybox__footer,.fancybox__caption{color:var(--tc-preview-text)!important;}",
    ".fancybox__toolbar,.fancybox__footer{background:color-mix(in srgb,var(--tc-preview-bg) 88%,transparent)!important;}",
    ".f-button{background:var(--tc-preview-surface)!important;color:var(--tc-preview-text)!important;border:1px solid var(--tc-preview-border)!important;}",
    ".f-button:hover{background:var(--tc-preview-surface-hover)!important;}",
  ].join("");
}

function buildHtmlPreviewBridgeScript(): string {
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

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
