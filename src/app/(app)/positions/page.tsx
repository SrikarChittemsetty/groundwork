"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { submitOnChord } from "@/lib/keys";
import Chord from "@/components/Chord";

type Shift = {
  axiomId: string;
  statement: string;
  kind: "revised" | "retired";
  at: string;
};

type Position = {
  id: string;
  statement: string;
  steps: number;
  bedrock: number;
  settled: boolean;
  restsOn: { id: string; statement: string }[];
  inQuestion: boolean;
  inQuestionBecause: string;
  shifts: Shift[];
  createdAt: string;
};

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [statement, setStatement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/positions");
    if (res.ok) setPositions((await res.json()).positions);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Called from the form's onSubmit and from the Cmd+Enter shortcut, hence the
  // optional event rather than a synthesised one.
  async function create(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statement }),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      setPositions((p) => [data.position, ...p]);
      setStatement("");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save.");
    }
  }

  const inQuestion = positions.filter((p) => p.inQuestion);

  return (
    <>
      <h1>Positions</h1>
      <p className="subtitle">
        State something you hold. You&apos;ll be asked why, and asked again of
        the answer, until you reach something with no reason underneath it.
        That thing is an axiom, and it&apos;s yours — nothing here evaluates
        your answers or has an opinion about them.
      </p>

      <form onSubmit={create} className="card-form">
        <label htmlFor="statement">What do you hold?</label>
        <textarea
          id="statement"
          placeholder="e.g. I should turn down the higher-paying role. Or: it's wrong to keep this from her."
          value={statement}
          onKeyDown={submitOnChord(
            () => create(),
            !busy && Boolean(statement.trim())
          )}
          onChange={(e) => setStatement(e.target.value)}
          style={{ minHeight: 90 }}
        />
        <p className="footnote">
          Works best on something live and specific — a position you&apos;re
          actually holding right now, not one you&apos;re confident about in
          the abstract.
        </p>
        <div aria-live="polite">
          {error && <div className="error">{error}</div>}
        </div>
        <div style={{ marginTop: 18 }}>
          <button type="submit" disabled={busy || !statement.trim()}>
            {busy ? "Starting…" : <>Start asking why <Chord /></>}
          </button>
        </div>
      </form>

      {inQuestion.length > 0 && (
        <div className="card notice-card">
          <div className="title">
            {inQuestion.length === 1
              ? "One settled position is standing on ground that moved"
              : `${inQuestion.length} settled positions are standing on ground that moved`}
          </div>
          <div className="body-text">
            You changed something you'd reached bedrock on. These were settled
            against the older wording, so what they rest on isn't quite what it
            was. Nothing has been un-settled for you — that call is yours.
          </div>
          <ul className="plain-list">
            {inQuestion.map((p) => (
              <li key={p.id}>
                <Link href={`/positions/${p.id}`}>{p.statement}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2>Taken apart so far</h2>
      {loading ? (
        <div className="skeleton card-skeleton" />
      ) : positions.length === 0 ? (
        <div className="empty">
          <p>
            <strong>Nothing interrogated yet.</strong>
          </p>
          <p className="notice">
            Most positions survive two or three whys. The interesting ones stop
            somewhere you didn&apos;t expect — and the same few stopping points
            turn out to sit under nearly everything you think. Those
            accumulate on <Link href="/axioms">Axioms</Link>.
          </p>
        </div>
      ) : (
        positions.map((p) => (
          <article key={p.id} className="card interactive">
            <div className="title">
              <Link href={`/positions/${p.id}`}>{p.statement}</Link>
            </div>
            <div className="body-text">
              {p.steps === 0
                ? "Not started — it hasn't been asked why yet."
                : `${p.steps} ${p.steps === 1 ? "step" : "steps"} deep${
                    p.bedrock > 0
                      ? `, ${p.bedrock} reached bedrock`
                      : ", none reached bedrock yet"
                  }`}
            </div>
            {p.inQuestion && (
              <div className="body-text shifted">
                {p.inQuestionBecause}{" "}
                {p.shifts.map((sh) => (
                  <span key={sh.axiomId} className="shift-item">
                    &ldquo;{sh.statement}&rdquo;{" "}
                    <span className="meta">
                      ({sh.kind === "retired" ? "no longer held" : "reworded"}{" "}
                      {formatDate(sh.at)})
                    </span>
                  </span>
                ))}
              </div>
            )}
            <div className="card-actions">
              <span className="meta">
                {p.inQuestion
                  ? "Settled, in question"
                  : p.settled
                    ? "Settled"
                    : "Open"}{" "}
                · {formatDate(p.createdAt)}
              </span>
              <Link href={`/positions/${p.id}`}>
                <button className="ghost">
                  {p.steps === 0 ? "Begin" : "Continue"}
                </button>
              </Link>
            </div>
          </article>
        ))
      )}
    </>
  );
}
