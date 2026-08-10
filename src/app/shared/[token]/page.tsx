import Link from "next/link";
import { resolveShareLink } from "@/lib/circles";
import { safeDecrypt } from "@/lib/crypto";
import SharedArgument from "@/components/SharedArgument";
import { parseChain } from "@/lib/sharedChain";
import { formatDate } from "@/lib/format";

export const metadata = {
  title: "Shared reasoning — Values Mirror",
  robots: { index: false, follow: false },
};

// A single shared item, viewable by anyone holding the link. Read-only, and
// deliberately a dead end: there is no author profile, no other shares, and
// nothing to click through to. You see the one thing you were handed.
export default async function SharedPage({
  params,
}: {
  params: { token: string };
}) {
  const link = await resolveShareLink(params.token);

  if (!link) {
    return (
      <main className="shell">
        <h1>This link isn&apos;t active</h1>
        <p className="subtitle">
          It may have been revoked by the person who shared it, expired, or
          never existed. That&apos;s their call to make — ask them directly if
          you think it should still work.
        </p>
      </main>
    );
  }

  const share = link.share;
  const isValue = share.kind === "value";
  const isPosition = share.kind === "position";
  const title = share.title ? safeDecrypt(share.title) : null;
  const body = share.showBody && share.body ? safeDecrypt(share.body) : null;
  const note = share.showNote && share.note ? safeDecrypt(share.note) : null;

  return (
    <main className="shell">
      <p className="footnote" style={{ marginTop: 32 }}>
        Someone shared this with you deliberately.
      </p>
      <h1>
        {isPosition
          ? "A position, and why they hold it"
          : isValue
            ? "A value, as they define it"
            : "A decision they made"}
      </h1>
      <p className="subtitle">
        This is one thing they chose to show you — not their journal, and not
        anything else they&apos;ve written.
      </p>

      <article className="card">
        <div className="chips" style={{ marginBottom: 14 }}>
          <span
            className={`tag ${
              isPosition ? "position" : isValue ? "value" : "decision"
            }`}
          >
            {isPosition
              ? "Their position"
              : isValue
                ? "Their value"
                : "Their decision"}
          </span>
          {share.occurredAt && (
            <span className="meta">{formatDate(share.occurredAt)}</span>
          )}
        </div>

        {title && <div className="title">{title}</div>}
        {body && <div className="body-text">{body}</div>}
        {isPosition && share.showChain && (
          <SharedArgument nodes={parseChain(share.chain)} />
        )}

        {note && (
          <>
            <hr />
            <div className="footnote" style={{ marginBottom: 6 }}>
              What they wanted you to understand
            </div>
            <div className="body-text">{note}</div>
          </>
        )}

        <div className="card-actions">
          <span className="meta">Shared {formatDate(share.createdAt)}</span>
        </div>
      </article>

      <p className="footnote" style={{ marginTop: 24 }}>
        You can&apos;t reply here. If you want to respond, respond to them.
      </p>
      <hr />
      <p className="footnote">
        <Link href="/">Values Mirror</Link> — a private tool for checking
        whether you live consistently with your own stated values.
      </p>
    </main>
  );
}
