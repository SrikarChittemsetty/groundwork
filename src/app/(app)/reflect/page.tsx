"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime, renderReflectionHtml } from "@/lib/format";

type Reflection = {
  id: string;
  body: string;
  model: string;
  createdAt: string;
};

export default function ReflectPage() {
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/reflect");
    if (res.ok) {
      const data = await res.json();
      setReflections(data.reflections);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function generate() {
    setError(null);
    setBusy(true);
    const res = await fetch("/api/reflect", { method: "POST" });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      setReflections((r) => [data.reflection, ...r]);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not generate a reflection.");
    }
  }

  return (
    <>
      <h1>Reflect</h1>
      <p className="subtitle">
        Ask for an honest reflection on where your logged decisions line up with
        your stated values — and where they don&apos;t. It surfaces
        observations and questions, not verdicts. What you make of them is up to
        you.
      </p>

      <div className="row" style={{ marginBottom: 4 }}>
        <button onClick={generate} disabled={busy}>
          {busy ? "Reflecting…" : "Generate a reflection"}
        </button>
        <span className="footnote">
          Uses your current values and decisions each time.
        </span>
      </div>
      {error && <div className="error">{error}</div>}

      {loading ? (
        <div style={{ marginTop: 24 }}>
          <div className="skeleton card-skeleton" />
        </div>
      ) : reflections.length === 0 ? (
        <div className="empty">
          <p style={{ marginTop: 0 }}>
            <strong>No reflections yet.</strong>
          </p>
          <p className="notice">
            A reflection is most useful once there&apos;s something to look
            across — a few <Link href="/values">values</Link> and several{" "}
            <Link href="/log">logged decisions</Link> spread over time.
          </p>
          <p className="notice">
            It won&apos;t tell you whether you&apos;re living up to your
            values. It points at what&apos;s there and leaves the conclusion to
            you.
          </p>
        </div>
      ) : (
        reflections.map((r) => (
          <div key={r.id} className="card interactive">
            <div
              className="reflection"
              dangerouslySetInnerHTML={{
                __html: renderReflectionHtml(r.body),
              }}
            />
            <div className="card-actions">
              <span className="meta">
                {formatDateTime(r.createdAt)} · {r.model}
              </span>
            </div>
          </div>
        ))
      )}
    </>
  );
}
