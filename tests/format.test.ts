import { describe, it, expect } from "vitest";
import { renderReflectionHtml } from "@/lib/format";

// Reflection text is model output rendered with dangerouslySetInnerHTML, so
// escaping is a real security boundary, not a formatting nicety.
describe("renderReflectionHtml", () => {
  it("escapes raw HTML in model output", () => {
    const out = renderReflectionHtml('<img src=x onerror="alert(1)">');
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("escapes script tags", () => {
    const out = renderReflectionHtml("<script>alert('xss')</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("escapes ampersands so entities can't be smuggled in", () => {
    expect(renderReflectionHtml("&lt;script&gt;")).toContain("&amp;lt;");
  });

  it("renders ## headings", () => {
    expect(renderReflectionHtml("## Where things line up")).toBe(
      "<h2>Where things line up</h2>"
    );
  });

  it("renders bullet lists", () => {
    const out = renderReflectionHtml("- first\n- second");
    expect(out).toContain("<ul>");
    expect(out).toContain("<li>first</li>");
    expect(out).toContain("<li>second</li>");
    expect(out).toContain("</ul>");
  });

  it("closes a list before a following heading", () => {
    const out = renderReflectionHtml("- item\n\n## Next");
    expect(out.indexOf("</ul>")).toBeLessThan(out.indexOf("<h2>"));
  });

  it("renders bold but not arbitrary tags", () => {
    const out = renderReflectionHtml("**dev mock** <b>nope</b>");
    expect(out).toContain("<strong>dev mock</strong>");
    expect(out).toContain("&lt;b&gt;");
  });

  it("wraps plain lines in paragraphs", () => {
    expect(renderReflectionHtml("just a line")).toBe("<p>just a line</p>");
  });

  it("returns empty output for empty input", () => {
    expect(renderReflectionHtml("")).toBe("");
  });
});

// The model is asked for headings and bullets but isn't bound to that. These
// cover what it actually tends to return when it strays.
describe("renderReflectionHtml: formats the model doesn't promise", () => {
  it("renders numbered lists as an ordered list", () => {
    const out = renderReflectionHtml("1. first\n2. second");
    expect(out).toContain("<ol>");
    expect(out).toContain("<li>first</li>");
    expect(out).toContain("</ol>");
  });

  it("switches cleanly between bullet and numbered lists", () => {
    const out = renderReflectionHtml("- bullet\n1. numbered");
    expect(out.indexOf("</ul>")).toBeLessThan(out.indexOf("<ol>"));
  });

  it("renders any heading level as h2 to keep one visual hierarchy", () => {
    expect(renderReflectionHtml("#### deep")).toBe("<h2>deep</h2>");
  });

  it("renders blockquotes", () => {
    expect(renderReflectionHtml("> quoted")).toBe(
      "<blockquote>quoted</blockquote>"
    );
  });

  it("renders inline code without letting it inject markup", () => {
    const out = renderReflectionHtml("use `<script>` carefully");
    expect(out).toContain("<code>&lt;script&gt;</code>");
    expect(out).not.toContain("<script>");
  });

  it("does not interpret markdown inside a fenced code block", () => {
    const out = renderReflectionHtml("```\n## not a heading\n- not a bullet\n```");
    expect(out).toContain("<pre><code>");
    expect(out).toContain("## not a heading");
    expect(out).not.toContain("<h2>");
    expect(out).not.toContain("<li>");
  });

  it("still renders an unterminated code fence instead of dropping it", () => {
    const out = renderReflectionHtml("```\ndangling content");
    expect(out).toContain("dangling content");
  });

  it("escapes HTML inside fenced code", () => {
    const out = renderReflectionHtml("```\n<img src=x onerror=alert(1)>\n```");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("renders single-asterisk emphasis without breaking bold", () => {
    expect(renderReflectionHtml("*soft* and **hard**")).toBe(
      "<p><em>soft</em> and <strong>hard</strong></p>"
    );
  });

  it("leaves a lone asterisk alone", () => {
    expect(renderReflectionHtml("2 * 3 = 6")).toBe("<p>2 * 3 = 6</p>");
  });
});
