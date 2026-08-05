import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

async function getMarkdownUtils() {
  if (typeof globalThis.window === "undefined") {
    (globalThis as any).window = new JSDOM("").window;
  }
  return import("../src/utils/markdownClass.ts");
}

test("sanitize removes script and event handlers", async () => {
  const { renderMarkdown } = await getMarkdownUtils();
  const html = renderMarkdown(
    '<script>bad</script><img src="x" onerror="alert(1)"><b>ok</b>',
  );
  assert.ok(!html.includes("<script>"), "script tag should be removed");
  assert.ok(!html.includes("onerror"), "event handler should be removed");
  assert.ok(html.includes("<b>ok</b>"), "safe content should survive");
});

test("tc-attachment URI survives sanitization", async () => {
  const { renderMarkdownWithAttachments } = await getMarkdownUtils();
  const html = renderMarkdownWithAttachments(
    "![](./pic.png)",
    "tc-attachment://local/test.png",
  );
  assert.ok(
    html.includes('src="tc-attachment://local/test.png'),
    "tc-attachment src should survive",
  );
});

test("plain markdown round-trips through sanitize", async () => {
  const { renderMarkdown } = await getMarkdownUtils();
  const html = renderMarkdown("**bold** and `code`");
  assert.ok(
    html.includes("<strong>bold</strong>") || html.includes("<b>bold</b>"),
    "bold should survive",
  );
  assert.ok(html.includes("<code>code</code>"), "code should survive");
});

test("replay markdown marks external media and local file refs", async () => {
  const { renderMarkdown } = await getMarkdownUtils();
  const html = renderMarkdown(
    "[web](https://example.com)\n\n![remote](https://example.com/shot.png)\n\n[file](file:///tmp/report.md)\n\n![local](../images/shot.png)\n\n[sandbox](sandbox:/mnt/data/report.txt)",
  );

  assert.ok(
    html.includes(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">web</a>',
    ),
    "external links should open outside the app",
  );
  assert.ok(
    html.includes(
      '<a href="https://example.com/shot.png" target="_blank" rel="noopener noreferrer"><img',
    ),
    "remote images should be clickable",
  );
  assert.ok(
    html.includes('data-tc-file-href="file:///tmp/report.md"'),
    "file URLs should be preserved as controlled file targets",
  );
  assert.ok(
    html.includes(
      'data-tc-file-href="../images/shot.png" data-tc-file-image="true"',
    ),
    "local images should use the file target path",
  );
  assert.ok(
    html.includes('data-tc-file-href="sandbox:/mnt/data/report.txt"'),
    "sandbox file URLs should be preserved as controlled file targets",
  );
});

test("markdown class restores list markers after tailwind preflight reset", async () => {
  const { markdownClassName } = await getMarkdownUtils();
  assert.match(
    markdownClassName,
    /\[&_ul\]:list-disc/,
    "unordered lists should restore disc markers",
  );
  assert.match(
    markdownClassName,
    /\[&_ol\]:list-decimal/,
    "ordered lists should restore decimal markers",
  );
});

test("markdown rendering preserves list structure for replay transcripts", async () => {
  const { renderMarkdown } = await getMarkdownUtils();
  const html = renderMarkdown(
    "结果如下：\n\n1. 第一项\n2. 第二项\n\n- A\n- B",
  );
  assert.match(html, /<ol>\s*<li>第一项<\/li>\s*<li>第二项<\/li>\s*<\/ol>/);
  assert.match(html, /<ul>\s*<li>A<\/li>\s*<li>B<\/li>\s*<\/ul>/);
});

test("html fragments render while unsafe handlers are stripped", async () => {
  const { renderMarkdownWithAttachments } = await getMarkdownUtils();
  const html = renderMarkdownWithAttachments(
    `<section>
      <h2>Plan</h2>
      <table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>
      <svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="red" onload="bad()" /></svg>
      <button onclick="bad()">Run</button>
    </section>`,
    undefined,
  );

  assert.ok(html.includes("<section>"), "html section should survive");
  assert.ok(html.includes("<table>"), "html table should survive");
  assert.ok(html.includes("<svg"), "svg should survive");
  assert.ok(!html.includes("onload"), "svg event handler should be removed");
  assert.ok(!html.includes("onclick"), "button event handler should be removed");
});

test("raw html image refs resolve against pin attachments", async () => {
  const { renderMarkdownWithAttachments } = await getMarkdownUtils();
  const html = renderMarkdownWithAttachments(
    '<a href="./pin-aa11.attachments/shot.png"><img src="./pin-aa11.attachments/shot.png"></a>',
    "tc-attachment://local/tmp/pin-aa11.attachments",
  );

  assert.ok(
    html.includes('src="tc-attachment://local/tmp/pin-aa11.attachments/shot.png"'),
    "raw html img src should resolve to the pin attachment URL",
  );
  assert.ok(
    html.includes('href="tc-attachment://local/tmp/pin-aa11.attachments/shot.png"'),
    "wrapping html link should follow the resolved attachment URL",
  );
  assert.ok(html.includes('loading="lazy"'), "raw html images should lazy-load");
});

test("full html documents get sandbox CSP while preserving local scripts", async () => {
  const {
    isHtmlDocument,
    renderHtmlDocumentWithAttachments,
  } = await getMarkdownUtils();
  globalThis.window.document.documentElement.setAttribute("data-theme", "light");
  const html = renderHtmlDocumentWithAttachments(
    `<!doctype html>
    <html>
      <head>
        <base href="https://example.com/">
        <meta http-equiv="Content-Security-Policy" content="default-src *">
        <style>body { color: red; }</style>
      </head>
      <body>
        <img src="./pin-aa11.attachments/shot.png">
        <script>window.clicked = true;</script>
      </body>
    </html>`,
    "tc-attachment://local/tmp/pin-aa11.attachments",
  );

  assert.equal(isHtmlDocument(html), true);
  assert.ok(
    html.includes('data-termcanvas-theme="light"'),
    "iframe document should inherit the current app theme",
  );
  assert.ok(
    html.includes("connect-src 'none'"),
    "sandbox document should receive TermCanvas CSP",
  );
  assert.ok(!html.includes("<base"), "base tags should be removed");
  assert.ok(!html.includes("default-src *"), "caller CSP should be replaced");
  assert.ok(html.includes("<style>"), "local styles should survive");
  assert.ok(html.includes("<script>"), "local scripts should survive");
  assert.ok(
    html.includes(".fancybox__backdrop"),
    "fancybox backdrop should be themed inside iframe html",
  );
  assert.ok(
    html.includes("window.Fancybox"),
    "iframe html should inject the fancybox close bridge",
  );
  assert.ok(
    html.includes('src="tc-attachment://local/tmp/pin-aa11.attachments/shot.png"'),
    "full html doc image refs should resolve to pin attachments",
  );
});
