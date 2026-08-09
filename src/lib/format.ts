// Shared client-side formatting helpers.

export function formatDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Minimal, safe Markdown -> HTML for reflection output. We HTML-escape first,
// then apply a small whitelist of formatting (## headings, - bullets, **bold**,
// paragraphs). This keeps the model's output rendering nicely without pulling
// in a full markdown library, and without an XSS surface.
export function renderReflectionHtml(md: string): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  // Escape FIRST, then apply the small formatting whitelist to the escaped
  // text. Order matters: formatting after escaping means nothing the model
  // emits can introduce markup, only the tags we generate ourselves.
  const inline = (s: string) =>
    escape(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // Single-asterisk emphasis, only where it isn't part of a ** pair.
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");

  const lines = md.split("\n");
  const out: string[] = [];
  // The model is asked for headings and bullets, but it isn't bound to that —
  // it sometimes returns numbered lists or fenced code. Handle those rather
  // than rendering them as literal punctuation.
  let listType: "ul" | "ol" | null = null;
  let inCodeFence = false;
  const codeLines: string[] = [];

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  const openList = (type: "ul" | "ol") => {
    if (listType !== type) {
      closeList();
      out.push(`<${type}>`);
      listType = type;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    // Fenced code: buffer until the closing fence so its contents are never
    // interpreted as markdown.
    if (/^```/.test(trimmed)) {
      if (inCodeFence) {
        out.push(`<pre><code>${escape(codeLines.join("\n"))}</code></pre>`);
        codeLines.length = 0;
        inCodeFence = false;
      } else {
        closeList();
        inCodeFence = true;
      }
      continue;
    }
    if (inCodeFence) {
      codeLines.push(raw);
      continue;
    }

    if (!trimmed) {
      closeList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      closeList();
      out.push(`<h2>${inline(heading[2])}</h2>`);
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      openList("ul");
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      openList("ol");
      out.push(`<li>${inline(numbered[1])}</li>`);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      closeList();
      out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      continue;
    }

    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }

  // An unterminated fence still has to render, not vanish.
  if (inCodeFence && codeLines.length > 0) {
    out.push(`<pre><code>${escape(codeLines.join("\n"))}</code></pre>`);
  }
  closeList();
  return out.join("\n");
}
