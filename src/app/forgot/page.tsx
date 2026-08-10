"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/auth/reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setSent(data.message);
    else setError(data.error || "Something went wrong.");
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <span className="brand">Values Mirror</span>
        <p className="subtitle">
          Resetting your password doesn&apos;t touch anything you&apos;ve
          written. Your entries aren&apos;t locked with it.
        </p>

        {sent ? (
          <>
            <div className="success">{sent}</div>
            <p className="footnote">
              <Link href="/login">Back to sign in</Link>
            </p>
          </>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="email">Your email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && <div className="error">{error}</div>}
            <div style={{ marginTop: 18 }}>
              <button type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send a reset link"}
              </button>
            </div>
            <p className="footnote" style={{ marginTop: 20 }}>
              <Link href="/login">Back to sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
