"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime, renderReflectionHtml } from "@/lib/format";

type Reflection = {
  id: string;
  body: string;
  model: string;
  scope: string;
  createdAt: string;
};

type ValueOption = { id: string; title: string };

// Scope options. "Everything" is the default because the whole point is
// looking across your record — narrowing is for when that gets unwieldy.
type Scope =
  | { kind: "all" }
  | { kind: "days"; days: number }
  | { kind: "value"; id: string };

export default function ReflectPage() {
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [values, setValues] = useState<ValueOption[]>([]);
  const [scope, setScope] = useState<Scope>({ kind: "all" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
        Ask for an honest reflection on where your logged decisions line up with
        your stated values — and where they don&apos;t. It surfaces
        observations and questions, not verdicts. What you make of them is up to
        you.
      </p>

      <div className="card-form">
        <label id="scope-label">What should it look at?</label>
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
        {scope.kind !== "all" && (
          <p className="footnote">
            Narrowed reflections say so to the model, so a gap you filtered out
            isn&apos;t mistaken for a gap in your life.
          </p>
        )}

        <div className="row" style={{ marginTop: 18 }}>
          <button onClick={generate} disabled={busy}>
            {busy ? "Reflecting…" : "Generate a reflection"}
          </button>
          <span className="footnote" style={{ margin: 0 }}>
            Uses your current values and decisions each time.
          </span>
        </div>
        <div aria-live="polite">
          {error && <div className="error">{error}</div>}
        </div>
      </div>

      <h2>Reflections</h2>
      {loading ? (
        <div className="skeleton card-skeleton" />
      ) : reflections.length === 0 ? (
        <div className="empty">
          <p>
            <strong>No reflections yet.</strong>
          </p>
          <p className="notice">
            A reflection is most useful once there&apos;s something to look
            across — a few <Link href="/values">values</Link> and several{" "}
            <Link href="/log">logged decisions</Link> spread over time.
          </p>
          <p className="notice">
            It won&apos;t tell you whether you&apos;re living up to your values.
            It points at what&apos;s there and leaves the conclusion to you.
          </p>
        </div>
      ) : (
        reflections.map((r) => (
          <article key={r.id} className="card interactive">
            {r.scope !== "Everything" && (
              <div className="chips" style={{ marginBottom: 14 }}>
                <span className="chip static">{r.scope}</span>
              </div>
            )}
            <div
              className="reflection"
              dangerouslySetInnerHTML={{ __html: renderReflectionHtml(r.body) }}
            />
            <div className="card-actions">
              <span className="meta">
                {formatDateTime(r.createdAt)} · {r.model}
              </span>
            </div>
          </article>
        ))
      )}
    </>
  );
}
