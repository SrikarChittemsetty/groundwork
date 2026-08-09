"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";

type Value = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

type Version = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

export default function ValuesPage() {
  const [values, setValues] = useState<Value[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  // Inline editing state for one card at a time.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  // Per-value wording history, loaded on demand.
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<Version[]>([]);

  async function load() {
    const res = await fetch("/api/values");
    if (res.ok) {
      const data = await res.json();
      setValues(data.values);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/values", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      setValues((v) => [data.value, ...v]);
      setTitle("");
      setBody("");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save.");
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/values/${id}`, { method: "DELETE" });
    if (res.ok) setValues((v) => v.filter((x) => x.id !== id));
  }

  function startEdit(v: Value) {
    setEditingId(v.id);
    setEditTitle(v.title);
    setEditBody(v.body);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    setEditError(null);
    const res = await fetch(`/api/values/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle, body: editBody }),
    });
    if (res.ok) {
      setValues((vs) =>
        vs.map((x) =>
          x.id === id ? { ...x, title: editTitle.trim(), body: editBody.trim() } : x
        )
      );
      setEditingId(null);
      // A saved edit changes the history, so drop any cached view of it.
      if (historyId === id) setHistoryId(null);
    } else {
      const data = await res.json().catch(() => ({}));
      setEditError(data.error || "Could not save.");
    }
  }

  async function toggleHistory(id: string) {
    if (historyId === id) {
      setHistoryId(null);
      return;
    }
    const res = await fetch(`/api/values/${id}`);
    if (res.ok) {
      const data = await res.json();
      setHistory(data.versions);
      setHistoryId(id);
    }
  }

  return (
    <>
      <h1>Your values</h1>
      <p className="subtitle">
        Write down the core values you hold. Be honest and specific — this is
        just for you.
      </p>

      <form onSubmit={add} className="card-form">
        <label htmlFor="title">Value</label>
        <input
          id="title"
          type="text"
          placeholder="e.g. Honesty, even when it's costly"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label htmlFor="body">What it means to you</label>
        <textarea
          id="body"
          placeholder="Describe what living this value actually looks like…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {error && <div className="error">{error}</div>}
        <div style={{ marginTop: 18 }}>
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Add value"}
          </button>
        </div>
      </form>

      <h2>Stated values</h2>
      {loading ? (
        <>
          <div className="skeleton card-skeleton" />
          <div className="skeleton card-skeleton" />
        </>
      ) : values.length === 0 ? (
        <div className="empty">
          <p style={{ marginTop: 0 }}>
            <strong>Nothing here yet — start with one value.</strong>
          </p>
          <p className="notice">
            Write what you actually hold, not what sounds good. The tool only
            tells you something worth knowing if what&apos;s written here is
            honest. One specific value beats five aspirational ones.
          </p>
          <p className="notice">
            You can reword it later, and the earlier wording is kept — seeing
            how a value shifts over time is part of the point.
          </p>
        </div>
      ) : (
        values.map((v) =>
          editingId === v.id ? (
            <div key={v.id} className="card">
              <label>Value</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
              <label>What it means to you</label>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
              />
              {editError && <div className="error">{editError}</div>}
              <div className="row" style={{ marginTop: 18 }}>
                <button onClick={() => saveEdit(v.id)}>Save changes</button>
                <button className="ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div key={v.id} className="card interactive">
              <div className="title">{v.title}</div>
              <div className="body-text">{v.body}</div>
              <div className="card-actions">
                <span className="meta">Stated {formatDate(v.createdAt)}</span>
                <span className="row" style={{ gap: 6 }}>
                  <button className="ghost" onClick={() => toggleHistory(v.id)}>
                    {historyId === v.id ? "Hide history" : "History"}
                  </button>
                  <button className="ghost" onClick={() => startEdit(v)}>
                    Edit
                  </button>
                  <button className="link" onClick={() => remove(v.id)}>
                    Delete
                  </button>
                </span>
              </div>

              {historyId === v.id && (
                <div className="history">
                  <div className="footnote" style={{ marginBottom: 14 }}>
                    How you&apos;ve worded this value over time — oldest first.
                    Nothing here is overwritten when you edit.
                  </div>
                  {history.map((h, i) => (
                    <div key={h.id} className="history-item">
                      <span className="history-when">
                        {i === 0 ? "Originally" : "Reworded"}{" "}
                        {formatDate(h.createdAt)}
                      </span>
                      <div className="title">{h.title}</div>
                      <div className="body-text">{h.body}</div>
                    </div>
                  ))}
                  {history.length === 1 && (
                    <div className="footnote">
                      Only one wording so far — no revisions yet.
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        )
      )}
    </>
  );
}
