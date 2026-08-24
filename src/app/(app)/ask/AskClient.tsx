"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime, renderReflectionHtml } from "@/lib/format";
import Thinking from "@/components/Thinking";

type Consultation = {
  id: string;
  question: string;
  body: string;
  model: string;
  createdAt: string;
};

export default function AskClient() {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/ask");
    if (res.ok) {
      const data = await res.json();
      setConsultations(data.consultations);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      setConsultations((c) => [data.consultation, ...c]);
      setQuestion("");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not generate guidance.");
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/ask/${id}`, { method: "DELETE" });
    if (res.ok) setConsultations((c) => c.filter((x) => x.id !== id));
  }

  return (
    <>
      <h1>What should I do?</h1>
      <p className="subtitle">
        Describe a situation you&apos;re facing. The tool lays out how your own
        stated values bear on it and what your history suggests — the paths and
        their costs, never a verdict. The conclusion stays yours.
      </p>

      <form onSubmit={ask} className="card-form">
        <label htmlFor="question">The situation</label>
        <textarea
          id="question"
          placeholder="e.g. I've been offered a higher-paying role, but it would mean shipping a product I have doubts about…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={4000}
        />
        <div aria-live="polite">
          {error && <div className="error">{error}</div>}
        </div>
        <div className="row" style={{ marginTop: 18 }}>
          <button type="submit" disabled={busy}>
            {busy ? "Thinking…" : "Reason it through"}
          </button>
          <span className="footnote">
            Uses your current values and decision history.
          </span>
        </div>
      </form>

      {busy && <Thinking what="Reading your record" />}

      <h2>Past questions</h2>
      {loading ? (
        <div className="skeleton card-skeleton" />
      ) : consultations.length === 0 ? (
        <div className="empty">
          <p style={{ marginTop: 0 }}>
            <strong>Nothing asked yet.</strong>
          </p>
          <p className="notice">
            This works from your own <Link href="/values">stated values</Link>{" "}
            and <Link href="/log">decision history</Link> — the more honest
            those are, the more useful this is.
          </p>
          <p className="notice">
            It won&apos;t tell you what to do. It shows which of your values
            are in play, where they pull against each other, and what your past
            choices suggest about how you weigh them.
          </p>
        </div>
      ) : (
        consultations.map((c) => (
          <article key={c.id} className="card interactive">
            <div className="asked">{c.question}</div>
            <div
              className="reflection"
              dangerouslySetInnerHTML={{ __html: renderReflectionHtml(c.body) }}
            />
            <div className="card-actions">
              <span className="meta">
                {formatDateTime(c.createdAt)} · {c.model}
              </span>
              <button className="link" onClick={() => remove(c.id)}>
                Delete
              </button>
            </div>
          </article>
        ))
      )}
    </>
  );
}
