"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime, renderReflectionHtml } from "@/lib/format";

type Reflection = {
  id: string;
  body: string;
  model: string;
  source: string;
  scope: string;
  createdAt: string;
};

type ValueOption = { id: string; title: string };

type Scope =
  | { kind: "all" }
  | { kind: "days"; days: number }
  | { kind: "value"; id: string };

export default function ReflectClient({ aiEnabled }: { aiEnabled: boolean }) {
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [values, setValues] = useState<ValueOption[]>([]);
  const [scope, setScope] = useState<Scope>({ kind: "all" });
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [rRes, vRes] = await Promise.all([
      fetch("/api/reflect"),
      fetch("/api/values"),
    ]);
    if (rRes.ok) setReflections((await rRes.json()).reflections);
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

  useEffect(() => {
    load();
  }, []);

  function scopeLabel(): string {
    if (scope.kind === "days") return `The last ${scope.days} days`;
    if (scope.kind === "value")
      return values.find((v) => v.id === scope.id)?.title ?? "Everything";
    return "Everything";
  }

  async function saveNote(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch("/api/reflect/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: note, scope: scopeLabel() }),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      setReflections((r) => [data.reflection, ...r]);
      setNote("");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save.");
    }
  }

  async function generate() {
    setError(null);
    setBusy(true);
    const payload =
      scope.kind === "value"
        ? { valueId: scope.id }
        : scope.kind === "days"
          ? { sinceDays: scope.days }
          : {};
    const res = await fetch("/api/reflect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      setReflections((r) => [data.reflection, ...r]);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not generate a reflection.");
    }
  }

  const isActive = (s: Scope) =>
    s.kind === scope.kind &&
    (s.kind !== "value" || s.id === (scope as { id?: string }).id) &&
    (s.kind !== "days" || s.days === (scope as { days?: number }).days);

  return (
    <>
      <h1>Reflect</h1>
      <p className="subtitle">
        Sit with your own record and write down what you notice. Nothing here
        leaves this machine, and nothing is required of you but honesty.
      </p>

      <form onSubmit={saveNote} className="card-form">
        <label id="scope-label">What are you looking at?</label>
        <div className="chips" role="group" aria-labelledby="scope-label">
          <button
            type="button"
            className={`chip${isActive({ kind: "all" }) ? " on" : ""}`}
            aria-pressed={isActive({ kind: "all" })}
            onClick={() => setScope({ kind: "all" })}
          >
            Everything
          </button>
          <button
            type="button"
            className={`chip${isActive({ kind: "days", days: 30 }) ? " on" : ""}`}
            aria-pressed={isActive({ kind: "days", days: 30 })}
            onClick={() => setScope({ kind: "days", days: 30 })}
          >
            Last 30 days
          </button>
          <button
            type="button"
            className={`chip${isActive({ kind: "days", days: 90 }) ? " on" : ""}`}
            aria-pressed={isActive({ kind: "days", days: 90 })}
            onClick={() => setScope({ kind: "days", days: 90 })}
          >
            Last 90 days
          </button>
          {values.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`chip${isActive({ kind: "value", id: v.id }) ? " on" : ""}`}
              aria-pressed={isActive({ kind: "value", id: v.id })}
              onClick={() => setScope({ kind: "value", id: v.id })}
            >
              {v.title}
            </button>
          ))}
        </div>

        <label htmlFor="note">What do you notice?</label>
        <textarea
          id="note"
          placeholder="Where does your record line up with what you say you value, and where doesn't it? Write it plainly — no one else reads this."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ minHeight: 150 }}
        />
        <p className="footnote">
          Your <Link href="/timeline">timeline</Link> and{" "}
          <Link href="/patterns">patterns</Link> are the raw material. This is
          where you say what you make of them.
        </p>

        <div aria-live="polite">
          {error && <div className="error">{error}</div>}
        </div>

        <div className="row" style={{ marginTop: 18 }}>
          <button type="submit" disabled={saving || !note.trim()}>
            {saving ? "Saving…" : "Save this reflection"}
          </button>
          {aiEnabled && (
            <>
              <button
                type="button"
                className="ghost"
                onClick={generate}
                disabled={busy}
              >
                {busy ? "Thinking…" : "Or have AI draft one"}
              </button>
              <span className="footnote" style={{ margin: 0 }}>
                Sends your entries to Anthropic.
              </span>
            </>
          )}
        </div>
      </form>

      <h2>Reflections</h2>
      {loading ? (
        <div className="skeleton card-skeleton" />
      ) : reflections.length === 0 ? (
        <div className="empty">
          <p>
            <strong>Nothing written yet.</strong>
          </p>
          <p className="notice">
            This is the part that does the work. Reading your own record back
            and putting words to it is how the gap between what you say and
            what you do becomes visible.
          </p>
        </div>
      ) : (
        reflections.map((r) => (
          <article key={r.id} className="card interactive">
            <div className="chips" style={{ marginBottom: 14 }}>
              <span className={`tag ${r.source === "self" ? "value" : "decision"}`}>
                {r.source === "self" ? "Yours" : "AI draft"}
              </span>
              {r.scope !== "Everything" && (
                <span className="chip static">{r.scope}</span>
              )}
            </div>
            <div
              className="reflection"
              dangerouslySetInnerHTML={{ __html: renderReflectionHtml(r.body) }}
            />
            <div className="card-actions">
              <span className="meta">
                {formatDateTime(r.createdAt)}
                {r.source !== "self" && <> · {r.model}</>}
              </span>
            </div>
          </article>
        ))
      )}
    </>
  );
}
