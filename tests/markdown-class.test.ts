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
