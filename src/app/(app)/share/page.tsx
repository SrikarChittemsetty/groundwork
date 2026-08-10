"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";

type Value = { id: string; title: string; body: string };
type Position = {
  id: string;
  statement: string;
  steps: number;
  settled: boolean;
};
type Decision = { id: string; body: string; occurredAt: string };
type Circle = { id: string; name: string };
type Share = {
  id: string;
  kind: string;
  title: string | null;
  body: string | null;
  note: string | null;
  showBody: boolean;
  showNote: boolean;
  hidden: boolean;
  circleName: string | null;
  linkTokens: string[];
  commentCount: number;
  createdAt: string;
};

export default function SharePage() {
  const [values, setValues] = useState<Value[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [shares, setShares] = useState<Share[]>([]);

  const [pick, setPick] = useState<{
    kind: "value" | "decision" | "position";
    id: string;
  } | null>(null);
  const [circleId, setCircleId] = useState<string>("");
  const [note, setNote] = useState("");
  const [showBody, setShowBody] = useState(true);
  const [showNote, setShowNote] = useState(true);
  // Only meaningful for a position. Kept separate because naming your bedrock
  // is a bigger step than showing the argument that reaches it.
  const [showChain, setShowChain] = useState(true);
  const [showAxioms, setShowAxioms] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [v, d, c, s, p] = await Promise.all([
      fetch("/api/values"),
      fetch("/api/decisions"),
      fetch("/api/circles"),
      fetch("/api/shares"),
      fetch("/api/positions"),
    ]);
    if (v.ok) setValues((await v.json()).values);
    if (d.ok) setDecisions((await d.json()).decisions);
    if (p.ok) setPositions((await p.json()).positions);
    if (c.ok) setCircles((await c.json()).circles);
    if (s.ok) setShares((await s.json()).shares);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pick) return;
    setError(null);
    setBusy(true);
    const res = await fetch("/api/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: pick.kind,
        sourceId: pick.id,
        circleId: circleId || null,
        note,
        showBody,
        showChain,
        showAxioms,
        showNote,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setPick(null);
      setNote("");
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not share.");
    }
  }

  async function toggleHidden(s: Share) {
    await fetch(`/api/shares/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: !s.hidden }),
    });
    load();
  }

  async function unshare(id: string) {
    if (!window.confirm("Delete this shared copy? Your own record is untouched.")) return;
    await fetch(`/api/shares/${id}`, { method: "DELETE" });
    load();
  }

  async function makeLink(id: string) {
    const res = await fetch(`/api/shares/${id}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) load();
  }

  async function revokeLinks(id: string) {
    await fetch(`/api/shares/${id}/link`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    load();
  }

  return (
    <>
      <h1>Share something</h1>
      <p className="subtitle">
        Hand one specific thing to specific people. A position carries the
        argument under it, which is where two people who agree on what to do
        usually turn out to part company; a value carries how you define it,
        which is where two people using the same word turn out to mean
        different things. Nothing else of yours goes with it.
      </p>

      <form onSubmit={submit} className="card-form">
        <label>What are you sharing?</label>
        <div className="chips">
          {positions.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`chip${pick?.kind === "position" && pick.id === p.id ? " on" : ""}`}
              onClick={() => setPick({ kind: "position", id: p.id })}
              title={`${p.steps} ${p.steps === 1 ? "step" : "steps"}`}
            >
              {p.statement.slice(0, 40)}
              {p.statement.length > 40 ? "…" : ""}
            </button>
          ))}
          {values.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`chip${pick?.kind === "value" && pick.id === v.id ? " on" : ""}`}
              onClick={() => setPick({ kind: "value", id: v.id })}
            >
              {v.title}
            </button>
          ))}
          {decisions.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`chip${pick?.kind === "decision" && pick.id === d.id ? " on" : ""}`}
              onClick={() => setPick({ kind: "decision", id: d.id })}
            >
              {d.body.slice(0, 40)}
              {d.body.length > 40 ? "…" : ""}
            </button>
          ))}
        </div>
        {values.length === 0 &&
          decisions.length === 0 &&
          positions.length === 0 && (
            <p className="footnote">
              Nothing to share yet — take a{" "}
              <Link href="/positions">position</Link> apart, write a{" "}
              <Link href="/values">value</Link>, or log a{" "}
              <Link href="/log">decision</Link> first.
            </p>
          )}

        <label htmlFor="circle">Where?</label>
        <select
          id="circle"
          value={circleId}
          onChange={(e) => setCircleId(e.target.value)}
        >
          <option value="">A link only — no circle</option>
          {circles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label htmlFor="note">Anything you want them to understand?</label>
        <textarea
          id="note"
          placeholder="Why this matters to you, or where you think you and they might draw the line differently…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <label>What should they see?</label>
        <div className="chips">
          {pick?.kind === "position" ? (
            <>
              <button
                type="button"
                className={`chip${showChain ? " on" : ""}`}
                aria-pressed={showChain}
                onClick={() => setShowChain((s) => !s)}
              >
                Your reasoning
              </button>
              <button
                type="button"
                className={`chip${showAxioms ? " on" : ""}`}
                aria-pressed={showAxioms}
                onClick={() => setShowAxioms((s) => !s)}
              >
                What it bottoms out in
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`chip${showBody ? " on" : ""}`}
              aria-pressed={showBody}
              onClick={() => setShowBody((s) => !s)}
            >
              {pick?.kind === "decision"
                ? "The decision itself"
                : "How you define it"}
            </button>
          )}
          <button
            type="button"
            className={`chip${showNote ? " on" : ""}`}
            aria-pressed={showNote}
            onClick={() => setShowNote((s) => !s)}
          >
            Your note
          </button>
        </div>
        <p className="footnote">
          Anything you leave off never reaches them at all — it isn&apos;t
          hidden at their end, it was never sent. You can change your mind
          later, or hide the whole thing.
          {pick?.kind === "position" && !showAxioms && (
            <>
              {" "}
              With the last one off they see the argument but not the
              commitments underneath it.
            </>
          )}
        </p>

        <div aria-live="polite">{error && <div className="error">{error}</div>}</div>
        <div style={{ marginTop: 18 }}>
          <button type="submit" disabled={busy || !pick}>
            {busy ? "Sharing…" : "Share it"}
          </button>
        </div>
      </form>

      <h2>What you&apos;ve shared</h2>
      {loading ? (
        <div className="skeleton card-skeleton" />
      ) : shares.length === 0 ? (
        <div className="empty">
          <p className="notice">
            Nothing shared. Your record is yours alone until you decide
            otherwise.
          </p>
        </div>
      ) : (
        shares.map((s) => (
          <article key={s.id} className="card">
            <div className="chips" style={{ marginBottom: 10 }}>
              <span className={`tag ${s.kind === "value" ? "value" : "decision"}`}>
                {s.kind === "value" ? "Value" : "Decision"}
              </span>
              {s.hidden && <span className="tag">Hidden</span>}
              <span className="meta">
                {s.circleName ? `in ${s.circleName}` : "link only"}
                {s.commentCount > 0 && <> · {s.commentCount} replies</>}
              </span>
            </div>
            {s.title && <div className="title">{s.title}</div>}
            {s.body && <div className="body-text">{s.body}</div>}

            {s.linkTokens.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="footnote" style={{ marginBottom: 6 }}>
                  Anyone with this link can read it:
                </div>
                <input
                  type="text"
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/shared/${s.linkTokens[0]}`}
                  onFocus={(e) => e.target.select()}
                />
              </div>
            )}

            <div className="card-actions">
              <span className="meta">Shared {formatDate(s.createdAt)}</span>
              <span className="row" style={{ gap: 6 }}>
                {s.linkTokens.length === 0 ? (
                  <button className="ghost" onClick={() => makeLink(s.id)}>
                    Make a link
                  </button>
                ) : (
                  <button className="ghost" onClick={() => revokeLinks(s.id)}>
                    Revoke link
                  </button>
                )}
                <button className="ghost" onClick={() => toggleHidden(s)}>
                  {s.hidden ? "Unhide" : "Hide"}
                </button>
                <button className="link" onClick={() => unshare(s.id)}>
                  Unshare
                </button>
              </span>
            </div>
          </article>
        ))
      )}
    </>
  );
}
