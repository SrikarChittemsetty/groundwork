"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";

type Circle = {
  id: string;
  name: string;
  memberCount: number;
  shareCount: number;
  isOwner: boolean;
  createdAt: string;
};

export default function CirclesPage() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/circles");
    if (res.ok) setCircles((await res.json()).circles);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/circles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      setCircles((c) => [data.circle, ...c]);
      setName("");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not create.");
    }
  }

  return (
    <>
      <h1>Circles</h1>
      <p className="subtitle">
        A circle is a small room where a few people show each other how they
        actually think about something. Nothing of yours appears in one unless
        you put it there, one piece at a time — and you can pull it back
        whenever you want.
      </p>

      <form onSubmit={create} className="card-form">
        <label htmlFor="name">Name a circle</label>
        <input
          id="name"
          type="text"
          placeholder="e.g. Sarah and me, or the house"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="footnote">
          Only you and the people you invite can see it exists.
        </p>
        <div aria-live="polite">
          {error && <div className="error">{error}</div>}
        </div>
        <div style={{ marginTop: 18 }}>
          <button type="submit" disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create circle"}
          </button>
        </div>
      </form>

      <h2>Your circles</h2>
      {loading ? (
        <div className="skeleton card-skeleton" />
      ) : circles.length === 0 ? (
        <div className="empty">
          <p>
            <strong>No circles yet.</strong>
          </p>
          <p className="notice">
            The point isn&apos;t to broadcast. It&apos;s that two people can
            both say they value the same thing and mean quite different things
            by it — and you only find that out by putting the definitions side
            by side.
          </p>
        </div>
      ) : (
        circles.map((c) => (
          <article key={c.id} className="card interactive">
            <div className="title">
              <Link href={`/circles/${c.id}`}>{c.name}</Link>
            </div>
            <div className="body-text">
              {c.memberCount} {c.memberCount === 1 ? "person" : "people"} ·{" "}
              {c.shareCount} {c.shareCount === 1 ? "thing" : "things"} shared
            </div>
            <div className="card-actions">
              <span className="meta">
                {c.isOwner ? "You created this" : "You joined"} ·{" "}
                {formatDate(c.createdAt)}
              </span>
              <Link href={`/circles/${c.id}`}>
                <button className="ghost">Open</button>
              </Link>
            </div>
          </article>
        ))
      )}
    </>
  );
}
