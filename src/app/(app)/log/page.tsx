"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";

type Decision = {
  id: string;
  body: string;
  occurredAt: string;
  valueIds: string[];
};

type ValueOption = { id: string; title: string };

// Local YYYY-MM-DD for the date input's default (today).
function todayIso(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export default function LogPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [body, setBody] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  // Inline editing state for one card at a time.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  // Which values this decision bears on — the user's own judgment.
  const [values, setValues] = useState<ValueOption[]>([]);
  const [valueIds, setValueIds] = useState<string[]>([]);
  const [editValueIds, setEditValueIds] = useState<string[]>([]);

  const titleFor = (id: string) =>
    values.find((v) => v.id === id)?.title ?? "(deleted value)";

  async function load() {
    const [dRes, vRes] = await Promise.all([
      fetch("/api/decisions"),
      fetch("/api/values"),
    ]);
    if (dRes.ok) {
      const data = await dRes.json();
      setDecisions(data.decisions);
    }
    if (vRes.ok) {
      const data = await vRes.json();
      setValues(
        data.values.map((v: { id: string; title: string }) => ({
          id: v.id,
          title: v.title,
        }))
      );
    }
    setLoading(false);
  }

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, occurredAt, valueIds }),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      setDecisions((d) =>
        [data.decision, ...d].sort(
          (a, b) =>
            new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
        )
      );
      setBody("");
      setOccurredAt(todayIso());
      setValueIds([]);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save.");
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/decisions/${id}`, { method: "DELETE" });
    if (res.ok) setDecisions((d) => d.filter((x) => x.id !== id));
  }

  function startEdit(d: Decision) {
    setEditingId(d.id);
    setEditBody(d.body);
    setEditDate(d.occurredAt.slice(0, 10));
    setEditValueIds(d.valueIds ?? []);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    setEditError(null);
    const res = await fetch(`/api/decisions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: editBody,
        occurredAt: editDate,
        valueIds: editValueIds,
      }),
    });
    if (res.ok) {
      setDecisions((ds) =>
        ds
          .map((x) =>
            x.id === id
              ? {
                  ...x,
                  body: editBody.trim(),
                  occurredAt: new Date(editDate).toISOString(),
                  valueIds: editValueIds,
                }
              : x
          )
          .sort(
            (a, b) =>
              new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
          )
      );
      setEditingId(null);
    } else {
      const data = await res.json().catch(() => ({}));
      setEditError(data.error || "Could not save.");
    }
  }

  return (
    <>
      <h1>Log a decision</h1>
      <p className="subtitle">
        Record a real decision or action you took, and when. Just the facts —
        you&apos;ll reflect on it later.
      </p>

      <form onSubmit={add} className="card-form">
        <label htmlFor="body">What did you decide or do?</label>
        <textarea
          id="body"
          placeholder="e.g. Turned down a lucrative project because the client asked me to fudge numbers."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <label htmlFor="date">When did it happen?</label>
        <input
          id="date"
          type="date"
          value={occurredAt}
          max={todayIso()}
          onChange={(e) => setOccurredAt(e.target.value)}
        />
        {values.length > 0 && (
          <>
            <label>Which of your values does this bear on? (optional)</label>
            <div className="chips">
              {values.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`chip${valueIds.includes(v.id) ? " on" : ""}`}
                  onClick={() => setValueIds((ids) => toggle(ids, v.id))}
                >
                  {v.title}
                </button>
              ))}
            </div>
            <p className="footnote">
              Your call, not the tool&apos;s — this is what you think the
              decision was about.
            </p>
          </>
        )}
        <div aria-live="polite">
          {error && <div className="error">{error}</div>}
        </div>
        <div style={{ marginTop: 18 }}>
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Log it"}
          </button>
        </div>
      </form>

      <h2>Logged decisions</h2>
      {loading ? (
        <>
          <div className="skeleton card-skeleton" />
          <div className="skeleton card-skeleton" />
        </>
      ) : decisions.length === 0 ? (
        <div className="empty">
          <p style={{ marginTop: 0 }}>
            <strong>No decisions logged yet.</strong>
          </p>
          <p className="notice">
            Log real things you did — including the ones you&apos;d rather not
            have on record. A log of only your good days is a log that
            can&apos;t tell you anything.
          </p>
          {values.length === 0 && (
            <p className="notice">
              You haven&apos;t written down any values yet either.{" "}
              <Link href="/values">Start there</Link> — then you can tag each
              decision with the values it bears on.
            </p>
          )}
        </div>
      ) : (
        decisions.map((d) =>
          editingId === d.id ? (
            <div key={d.id} className="card">
              <label>What did you decide or do?</label>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
              />
              <label>When did it happen?</label>
              <input
                type="date"
                value={editDate}
                max={todayIso()}
                onChange={(e) => setEditDate(e.target.value)}
              />
              {values.length > 0 && (
                <>
                  <label>Which of your values does this bear on?</label>
                  <div className="chips">
                    {values.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className={`chip${
                          editValueIds.includes(v.id) ? " on" : ""
                        }`}
                        onClick={() =>
                          setEditValueIds((ids) => toggle(ids, v.id))
                        }
                      >
                        {v.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {editError && <div className="error">{editError}</div>}
              <div className="row" style={{ marginTop: 18 }}>
                <button onClick={() => saveEdit(d.id)}>Save changes</button>
                <button className="ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <article key={d.id} className="card interactive">
              <div className="body-text">{d.body}</div>
              {d.valueIds && d.valueIds.length > 0 && (
                <div className="chips" style={{ marginTop: 12 }}>
                  {d.valueIds.map((id) => (
                    <span key={id} className="chip static">
                      {titleFor(id)}
                    </span>
                  ))}
                </div>
              )}
              <div className="card-actions">
                <span className="meta">{formatDate(d.occurredAt)}</span>
                <span className="row" style={{ gap: 6 }}>
                  <button className="ghost" onClick={() => startEdit(d)}>
                    Edit
                  </button>
                  <button className="link" onClick={() => remove(d.id)}>
                    Delete
                  </button>
                </span>
              </div>
            </article>
          )
        )
      )}
    </>
  );
}
