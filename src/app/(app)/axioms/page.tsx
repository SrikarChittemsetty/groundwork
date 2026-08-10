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

export default function AxiomsPage() {
  const [axioms, setAxioms] = useState<Axiom[]>([]);
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/axioms");
    if (res.ok) setAxioms((await res.json()).axioms);
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

  // Sorted by how much rests on them — the ones under several positions first.
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
        sorted.map((a) => (
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
            </div>
          </article>
        ))
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
