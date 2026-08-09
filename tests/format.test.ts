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
