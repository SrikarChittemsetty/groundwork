"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";

type Axiom = {
  id: string;
  statement: string;
  reachedFrom: { id: string; statement: string }[];
  createdAt: string;
};

type Side = {
  id: string;
  statement: string;
  carries: { id: string; statement: string }[];
};

type Tension = {
  id: string;
  a: Side;
  b: Side;
  note: string;
  resolution: string | null;
  resolved: boolean;
  createdAt: string;
};

export default function AxiomsClient() {
  const [axioms, setAxioms] = useState<Axiom[]>([]);
  const [tensions, setTensions] = useState<Tension[]>([]);
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // Marking a pull between two axioms.
  const [pair, setPair] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function load() {
    const [aRes, tRes] = await Promise.all([
      fetch("/api/axioms"),
      fetch("/api/axioms/tensions"),
    ]);
    if (aRes.ok) setAxioms((await aRes.json()).axioms);
    if (tRes.ok) setTensions((await tRes.json()).tensions);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/axioms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statement }),
    });
    setBusy(false);
    if (res.ok) {
      setStatement("");
      load();
    }
  }

  function togglePair(id: string) {
    setError(null);
    setPair((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)
    );
  }

  async function markTension(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pair.length !== 2) return;
    const res = await fetch("/api/axioms/tensions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aId: pair[0], bId: pair[1], note }),
    });
    if (res.ok) {
      setPair([]);
      setNote("");
      load();
    } else {
      setError((await res.json().catch(() => ({}))).error || "Could not save.");
    }
  }

  async function resolve(id: string, resolved: boolean) {
    await fetch("/api/axioms/tensions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, resolved, resolution: drafts[id] ?? undefined }),
    });
    load();
  }

  async function removeTension(id: string) {
    if (!window.confirm("Remove this noted tension?")) return;
    await fetch("/api/axioms/tensions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  const sorted = [...axioms].sort(
    (a, b) => b.reachedFrom.length - a.reachedFrom.length
  );

  return (
    <>
      <h1>Axioms</h1>
      <p className="subtitle">
        The places your reasoning stops. Not conclusions — the things you hold
        with nothing underneath them, that everything else rests on.
      </p>

      {loading ? (
        <div className="skeleton card-skeleton" />
      ) : sorted.length === 0 ? (
        <div className="empty">
          <p>
            <strong>None found yet.</strong>
          </p>
          <p className="notice">
            These aren&apos;t written directly so much as arrived at. Take a{" "}
            <Link href="/positions">position</Link> apart and keep answering
            why; where you run out of answers is an axiom.
          </p>
        </div>
      ) : (
        <>
          {sorted.map((a) => (
            <article key={a.id} className="card interactive">
              <div className="title">{a.statement}</div>
              {a.reachedFrom.length === 0 ? (
                <div className="body-text notice">
                  Stated directly — nothing has been traced down to it yet.
                </div>
              ) : (
                <>
                  <div className="footnote" style={{ marginTop: 10 }}>
                    {a.reachedFrom.length === 1
                      ? "Reached from:"
                      : `Everything below bottoms out here — ${a.reachedFrom.length} positions:`}
                  </div>
                  <ul className="facts">
                    {a.reachedFrom.map((p) => (
                      <li key={p.id}>
                        <Link href={`/positions/${p.id}`}>{p.statement}</Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="card-actions">
                <span className="meta">Since {formatDate(a.createdAt)}</span>
                {sorted.length > 1 && (
                  <button
                    className={`chip${pair.includes(a.id) ? " on" : ""}`}
                    aria-pressed={pair.includes(a.id)}
                    onClick={() => togglePair(a.id)}
                  >
                    {pair.includes(a.id) ? "Selected" : "Pulls against…"}
                  </button>
                )}
              </div>
            </article>
          ))}

          {pair.length > 0 && (
            <form onSubmit={markTension} className="card-form">
              <label htmlFor="tension-note">
                {pair.length === 1
                  ? "Now pick the other one"
                  : "Where do these two pull against each other?"}
              </label>
              {pair.length === 2 && (
                <>
                  <div className="compare" style={{ marginBottom: 14 }}>
                    {pair.map((id) => (
                      <div key={id} className="compare-side">
                        <div className="body-text">
                          {axioms.find((a) => a.id === id)?.statement}
                        </div>
                      </div>
                    ))}
                  </div>
                  <textarea
                    id="tension-note"
                    placeholder="Where does holding both actually cost you something? A case where they'd tell you to do different things is the useful thing to write down."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <p className="footnote">
                    Noting a pull isn&apos;t admitting a mistake. Most people
                    hold commitments that compete; knowing which ones, and what
                    each one is carrying, is the point.
                  </p>
                  <div aria-live="polite">
                    {error && <div className="error">{error}</div>}
                  </div>
                  <div className="row" style={{ marginTop: 16 }}>
                    <button type="submit" disabled={!note.trim()}>
                      Note the tension
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setPair([]);
                        setError(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </>
      )}

      {tensions.length > 0 && (
        <>
          <h2>Where they pull against each other</h2>
          {tensions.map((t) => (
            <article key={t.id} className="card">
              <div className="compare">
                {[t.a, t.b].map((side) => (
                  <div key={side.id} className="compare-side">
                    <div className="title" style={{ fontSize: 17 }}>
                      {side.statement}
                    </div>
                    {side.carries.length > 0 ? (
                      <>
                        <div className="footnote">Carrying:</div>
                        <ul className="facts">
                          {side.carries.map((p) => (
                            <li key={p.id}>
                              <Link href={`/positions/${p.id}`}>
                                {p.statement}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="footnote">Nothing traced to it yet.</p>
                    )}
                  </div>
                ))}
              </div>

              <hr />
              <div className="footnote" style={{ marginBottom: 6 }}>
                Where you think the pull is
              </div>
              <div className="body-text">{t.note}</div>

              {t.resolved ? (
                <>
                  <div className="footnote" style={{ marginTop: 14 }}>
                    What you came to
                  </div>
                  <div className="body-text">
                    {t.resolution ?? <em className="notice">Nothing written.</em>}
                  </div>
                  <div className="card-actions">
                    <span className="meta">
                      Settled · noted {formatDate(t.createdAt)}
                    </span>
                    <span className="row" style={{ gap: 6 }}>
                      <button className="ghost" onClick={() => resolve(t.id, false)}>
                        Reopen
                      </button>
                      <button className="link" onClick={() => removeTension(t.id)}>
                        Remove
                      </button>
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginTop: 16 }}>
                    <label htmlFor={`res-${t.id}`}>
                      What did you come to?
                    </label>
                    <textarea
                      id={`res-${t.id}`}
                      placeholder="Which one gives way, and when? &quot;I hold both and accept the cost&quot; counts — it's a position, not a dodge."
                      value={drafts[t.id] ?? ""}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [t.id]: e.target.value }))
                      }
                    />
                  </div>
                  <div className="card-actions">
                    <span className="meta">
                      Open · noted {formatDate(t.createdAt)}
                    </span>
                    <span className="row" style={{ gap: 6 }}>
                      <button
                        className="ghost"
                        onClick={() => resolve(t.id, true)}
                        disabled={!(drafts[t.id] ?? "").trim()}
                      >
                        That&apos;s where I land
                      </button>
                      <button className="link" onClick={() => removeTension(t.id)}>
                        Remove
                      </button>
                    </span>
                  </div>
                </>
              )}
            </article>
          ))}
        </>
      )}

      <h2>Or state one outright</h2>
      <form onSubmit={add} className="card-form">
        <label htmlFor="statement">
          Something you hold with no reason underneath it
        </label>
        <textarea
          id="statement"
          placeholder="e.g. Suicide is never the answer. Or: a person's worth doesn't depend on what they produce."
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
        />
        <p className="footnote">
          Worth doing sparingly. An axiom you arrived at by running out of
          answers is better evidence than one you nominated.
        </p>
        <div style={{ marginTop: 16 }}>
          <button type="submit" disabled={busy || !statement.trim()}>
            {busy ? "Saving…" : "Add it"}
          </button>
        </div>
      </form>
    </>
  );
}
