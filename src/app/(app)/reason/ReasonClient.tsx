"use client";

import { useState } from "react";
import Link from "next/link";

type Step = { cites: string[]; claim: string };
type RecordItem = { tag: string; kind: string; text: string };

export default function ReasonClient() {
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [situation, setSituation] = useState("");
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [record, setRecord] = useState<RecordItem[]>([]);
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/reason", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction, situation }),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      setSteps(data.steps);
      setRecord(data.record);
      setModel(data.model);
    } else {
      setSteps(null);
      setError((await res.json().catch(() => ({}))).error || "Could not run.");
    }
  }

  const entryFor = (tag: string) => record.find((r) => r.tag === tag);
  const ungrounded = steps?.filter((s) => s.cites.length === 0).length ?? 0;

  return (
    <>
      <h1>Reason it through</h1>
      <p className="subtitle">
        Runs over what you&apos;ve written and shows its work. Every step has
        to name the entry of yours it rests on — and any step that can&apos;t
        is marked, because a premise the model brought with it should never
        read like one of yours.
      </p>

      <form onSubmit={run} className="card-form">
        <label id="dir-label">Which way?</label>
        <div className="chips" role="group" aria-labelledby="dir-label">
          <button
            type="button"
            className={`chip${direction === "forward" ? " on" : ""}`}
            aria-pressed={direction === "forward"}
            onClick={() => setDirection("forward")}
          >
            Forward — from my axioms to a choice
          </button>
          <button
            type="button"
            className={`chip${direction === "backward" ? " on" : ""}`}
            aria-pressed={direction === "backward"}
            onClick={() => setDirection("backward")}
          >
            Backward — from what I did to where it diverged
          </button>
        </div>

        <label htmlFor="situation">
          {direction === "forward"
            ? "The situation in front of you"
            : "What you actually did"}
        </label>
        <textarea
          id="situation"
          placeholder={
            direction === "forward"
              ? "e.g. I've been offered the role. I have a week to answer."
              : "e.g. I took the role and told myself I'd renegotiate the parts I didn't like later."
          }
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          style={{ minHeight: 110 }}
          maxLength={4000}
        />
        <p className="footnote">
          Draws on your <Link href="/axioms">axioms</Link>,{" "}
          <Link href="/positions">positions</Link>,{" "}
          <Link href="/values">values</Link>, and{" "}
          <Link href="/log">decisions</Link>. Nothing is saved — if a step is
          worth keeping, write it up in your own words as a{" "}
          <Link href="/reflect">reflection</Link>.
        </p>

        <div aria-live="polite">
          {error && <div className="error">{error}</div>}
        </div>
        <div style={{ marginTop: 18 }}>
          <button type="submit" disabled={busy || !situation.trim()}>
            {busy ? "Working…" : "Show the reasoning"}
          </button>
        </div>
      </form>

      {steps && (
        <>
          <h2>The reasoning</h2>
          {ungrounded > 0 && (
            <p className="footnote" style={{ marginBottom: 12 }}>
              {ungrounded} of {steps.length} steps rest on nothing in your
              record. Those are the model&apos;s, not yours — treat them as
              claims to accept or reject, not as things you already believed.
            </p>
          )}

          {steps.length === 0 ? (
            <div className="empty">
              <p className="notice">
                Nothing came back in a readable form. Try again, or narrow what
                you asked.
              </p>
            </div>
          ) : (
            <ol className="steps">
              {steps.map((s, i) => (
                <li
                  key={i}
                  className={s.cites.length === 0 ? "step ungrounded" : "step"}
                >
                  <div className="body-text">{s.claim}</div>
                  <div className="chips" style={{ marginTop: 10 }}>
                    {s.cites.length === 0 ? (
                      <span className="tag">Not from your record</span>
                    ) : (
                      s.cites.map((tag) => {
                        const e = entryFor(tag);
                        return (
                          <span
                            key={tag}
                            className="chip static"
                            title={e?.text ?? tag}
                          >
                            {e ? `${e.kind}: ${truncate(e.text)}` : tag}
                          </span>
                        );
                      })
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}

          <p className="footnote" style={{ marginTop: 16 }}>
            {model} · The conclusion is still yours to draw. Nothing here
            decided anything.
          </p>
        </>
      )}
    </>
  );
}

function truncate(text: string, n = 48) {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}
