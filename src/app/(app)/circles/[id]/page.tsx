"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/format";

type Comment = {
  id: string;
  author: string;
  isYours: boolean;
  body: string;
  createdAt: string;
};

type Share = {
  id: string;
  kind: string;
  isYours: boolean;
  author: string;
  title: string | null;
  body: string | null;
  note: string | null;
  occurredAt: string | null;
  createdAt: string;
  comments: Comment[];
};

type Circle = {
  id: string;
  name: string;
  isOwner: boolean;
  members: { userId: string; email: string; role: string; isYou: boolean }[];
  shares: Share[];
};

// Group value-shares by name so differing definitions of the same word sit
// next to each other. Two people saying "modesty" and meaning different things
// is the whole reason to share a value rather than just a decision.
function comparisons(shares: Share[]) {
  const byName = new Map<string, Share[]>();
  for (const s of shares) {
    if (s.kind !== "value" || !s.title) continue;
    const key = s.title.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), s]);
  }
  return [...byName.entries()]
    .filter(([, group]) => {
      // Only interesting when more than one person weighed in.
      const authors = new Set(group.map((s) => s.author));
      return authors.size > 1;
    })
    .map(([, group]) => group);
}

export default function CirclePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [circle, setCircle] = useState<Circle | null>(null);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function load() {
    const res = await fetch(`/api/circles/${id}`);
    if (res.ok) setCircle((await res.json()).circle);
    else setGone(true);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function makeInvite(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/circles/${id}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expiresInDays: 14,
        email: inviteEmail.trim() || undefined,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setInvite(`${window.location.origin}/join?token=${data.invite.token}`);
    }
  }

  async function removeMember(memberId: string, email: string) {
    if (
      !window.confirm(
        `Remove ${email} from this circle? Anything they shared here goes with them. Their own private records aren't touched.`
      )
    )
      return;
    const res = await fetch(`/api/circles/${id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    if (res.ok) load();
  }

  async function comment(shareId: string) {
    const body = (drafts[shareId] ?? "").trim();
    if (!body) return;
    const res = await fetch(`/api/shares/${shareId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.ok) {
      setDrafts((d) => ({ ...d, [shareId]: "" }));
      load();
    }
  }

  async function leave() {
    const owner = circle?.isOwner;
    if (
      !window.confirm(
        owner
          ? "Delete this circle for everyone? The shared copies and comments go with it. Nobody's own private records are touched."
          : "Leave this circle? Anything you shared into it goes with you."
      )
    )
      return;
    const res = await fetch(`/api/circles/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/circles");
  }

  if (loading) return <div className="skeleton card-skeleton" />;

  if (gone || !circle) {
    return (
      <>
        <h1>Not found</h1>
        <p className="subtitle">
          This circle doesn&apos;t exist, or you&apos;re not in it.
        </p>
        <p>
          <Link href="/circles">Back to your circles</Link>
        </p>
      </>
    );
  }

  const groups = comparisons(circle.shares);

  return (
    <>
      <h1>{circle.name}</h1>
      <div className="chips" style={{ marginBottom: 20 }}>
        {circle.members.map((m) => (
          <span key={m.userId} className="chip static">
            {m.isYou ? "you" : m.email}
            {m.role === "owner" && " · created it"}
            {circle.isOwner && !m.isYou && (
              <button
                className="chip-x"
                aria-label={`Remove ${m.email}`}
                title={`Remove ${m.email}`}
                onClick={() => removeMember(m.userId, m.email)}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>

      <div className="row" style={{ marginBottom: 8 }}>
        <button className="ghost" onClick={() => setInviteOpen((o) => !o)}>
          {inviteOpen ? "Cancel invite" : "Invite someone"}
        </button>
        <Link href="/share">
          <button className="ghost">Share something here</button>
        </Link>
        <span className="spacer" />
        <button className="link" onClick={leave}>
          {circle.isOwner ? "Delete circle" : "Leave"}
        </button>
      </div>

      {inviteOpen && (
        <form onSubmit={makeInvite} className="card-form">
          <label htmlFor="inviteEmail">
            Their email — optional, but safer
          </label>
          <input
            id="inviteEmail"
            type="email"
            placeholder="sarah@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <p className="footnote">
            With an address, only that person can accept and the link is spent
            once used — forwarding it gets nobody in. Leave it blank for a plain
            link anyone holding it can use. Either way it lasts 14 days and you
            can revoke it.
          </p>
          <div style={{ marginTop: 16 }}>
            <button type="submit">Make the link</button>
          </div>
        </form>
      )}

      {invite && (
        <div className="card">
          <div className="footnote" style={{ marginBottom: 8 }}>
            {inviteEmail.trim()
              ? `Only ${inviteEmail.trim()} can use this, once.`
              : "Anyone holding this link can join."}
          </div>
          <input type="text" readOnly value={invite} onFocus={(e) => e.target.select()} />
        </div>
      )}

      {groups.length > 0 && (
        <>
          <h2>Where you differ</h2>
          <p className="footnote" style={{ marginBottom: 12 }}>
            You&apos;ve each written down what the same value means to you.
            That&apos;s usually where the actual disagreement lives.
          </p>
          {groups.map((group, i) => (
            <article key={i} className="card">
              <div className="title">{group[0].title}</div>
              <div className="compare">
                {group.map((s) => (
                  <div key={s.id} className="compare-side">
                    <div className="history-when">
                      {s.isYours ? "You" : s.author}
                    </div>
                    <div className="body-text">
                      {s.body ?? <em className="notice">Not shown</em>}
                    </div>
                    {s.note && (
                      <p className="footnote" style={{ marginTop: 8 }}>
                        {s.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </>
      )}

      <h2>Shared here</h2>
      {circle.shares.length === 0 ? (
        <div className="empty">
          <p>
            <strong>Nothing shared yet.</strong>
          </p>
          <p className="notice">
            Share a value with its definition and the others can see exactly
            where they&apos;d draw the line differently.{" "}
            <Link href="/share">Pick something to share</Link>.
          </p>
        </div>
      ) : (
        circle.shares.map((s) => (
          <article key={s.id} className="card interactive">
            <div className="chips" style={{ marginBottom: 12 }}>
              <span className={`tag ${s.kind === "value" ? "value" : "decision"}`}>
                {s.kind === "value" ? "Value" : "Decision"}
              </span>
              <span className="meta">
                {s.isYours ? "You" : s.author}
                {s.occurredAt && <> · {formatDate(s.occurredAt)}</>}
              </span>
            </div>

            {s.title && <div className="title">{s.title}</div>}
            {s.body && <div className="body-text">{s.body}</div>}
            {s.note && (
              <>
                <hr />
                <div className="footnote" style={{ marginBottom: 6 }}>
                  {s.isYours ? "What you wanted them to understand" : "What they wanted you to understand"}
                </div>
                <div className="body-text">{s.note}</div>
              </>
            )}

            {s.comments.length > 0 && (
              <div className="history">
                {s.comments.map((c) => (
                  <div key={c.id} className="history-item">
                    <span className="history-when">
                      {c.isYours ? "You" : c.author} ·{" "}
                      {formatDateTime(c.createdAt)}
                    </span>
                    <div className="body-text">{c.body}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <textarea
                placeholder="Say where you see it differently…"
                value={drafts[s.id] ?? ""}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [s.id]: e.target.value }))
                }
                style={{ minHeight: 70 }}
              />
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  className="ghost"
                  onClick={() => comment(s.id)}
                  disabled={!(drafts[s.id] ?? "").trim()}
                >
                  Reply
                </button>
              </div>
            </div>
          </article>
        ))
      )}
    </>
  );
}
