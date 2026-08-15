"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [valid, setValid] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Checked before showing the form, so nobody types a new password into
  // something that was always going to fail.
  useEffect(() => {
    (async () => {
      if (!token) {
        setValid(false);
        return;
      }
      const res = await fetch(
        `/api/auth/reset/confirm?token=${encodeURIComponent(token)}`
      );
      setValid(res.ok ? (await res.json()).valid : false);
    })();
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/auth/reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setBusy(false);
    if (res.ok) {
      router.push("/values");
      router.refresh();
    } else {
      setError((await res.json().catch(() => ({}))).error || "Could not reset.");
    }
  }

  if (valid === null) return <div className="skeleton" style={{ height: 90 }} />;

  if (!valid) {
    return (
      <>
        <p className="subtitle">
          This link has expired or was already used. Links work once and last
          an hour.
        </p>
        <p className="footnote">
          <Link href="/forgot">Ask for a new one</Link> — nothing you&apos;ve
          written is affected.
        </p>
      </>
    );
  }

  return (
    <form onSubmit={submit}>
      <p className="subtitle">
        Pick a new password. Your entries are unaffected — they were never
        locked with the old one.
      </p>
      <label htmlFor="password">New password (min 8 characters)</label>
      <input
        id="password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        required
      />
      {error && <div className="error">{error}</div>}
      <div style={{ marginTop: 18 }}>
        <button type="submit" disabled={busy}>
          {busy ? "Setting…" : "Set it and sign in"}
        </button>
      </div>
    </form>
  );
}

export default function ResetPage() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <span className="brand">Groundwork</span>
        <Suspense fallback={<div className="skeleton" style={{ height: 90 }} />}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
