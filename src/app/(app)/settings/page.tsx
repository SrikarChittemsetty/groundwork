"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SettingsPage() {
  const router = useRouter();
  const [confirmEmail, setConfirmEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwDone(false);
    setPwBusy(true);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setPwBusy(false);
    if (res.ok) {
      setCurrentPassword("");
      setNewPassword("");
      setPwDone(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setPwError(data.error || "Could not change password.");
    }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (
      !window.confirm(
        "This permanently deletes your account and all your values, decisions, and reflections. This cannot be undone. Continue?"
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmEmail }),
    });
    setBusy(false);
    if (res.ok) {
      router.push("/signup");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not delete account.");
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <p className="subtitle">
        Your data is yours. Everything is encrypted at rest and visible only to
        you — see <Link href="/privacy">how your data is handled</Link> for the
        full picture, including the limits.
      </p>

      <h2>Change your password</h2>
      <div className="card">
        <form onSubmit={changePassword}>
          <label htmlFor="currentPassword">Current password</label>
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <label htmlFor="newPassword">New password (min 8 characters)</label>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
          {pwError && <div className="error">{pwError}</div>}
          {pwDone && <div className="success">Password updated.</div>}
          <div style={{ marginTop: 12 }}>
            <button type="submit" disabled={pwBusy}>
              {pwBusy ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      </div>

      <h2>Export your data</h2>
      <div className="card">
        <p className="notice">
          Download a complete, decrypted copy of your account — every value,
          decision, and reflection — as JSON.
        </p>
        <div style={{ marginTop: 12 }}>
          <a href="/api/account/export">
            <button type="button">Download my data (JSON)</button>
          </a>
        </div>
      </div>

      <h2 style={{ color: "var(--danger)" }}>Delete everything</h2>
      <div className="card">
        <p className="notice">
          Permanently delete your account and all associated data. This cannot
          be undone. Type your account email to confirm.
        </p>
        <form onSubmit={deleteAccount}>
          <label htmlFor="confirmEmail">Confirm email</label>
          <input
            id="confirmEmail"
            type="email"
            placeholder="you@example.com"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            required
          />
          {error && <div className="error">{error}</div>}
          <div style={{ marginTop: 12 }}>
            <button className="danger" type="submit" disabled={busy}>
              {busy ? "Deleting…" : "Permanently delete my account"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
