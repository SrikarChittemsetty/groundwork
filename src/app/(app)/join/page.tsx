"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type Preview = {
  id: string;
  name: string;
  memberCount: number;
  alreadyMember: boolean;
};

// You see what room you're being asked into before you're in it — the name and
// how many people, never the contents.
export default function JoinPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!token) {
        setError("That link is missing its invite code.");
        setLoading(false);
        return;
      }
      const res = await fetch(`/api/circles/join?token=${encodeURIComponent(token)}`);
      if (res.ok) setPreview((await res.json()).circle);
      else setError((await res.json().catch(() => ({}))).error || "Invalid invite.");
      setLoading(false);
    })();
  }, [token]);

  async function join() {
    setBusy(true);
    const res = await fetch("/api/circles/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      router.push(`/circles/${data.circleId}`);
    } else {
      setError((await res.json().catch(() => ({}))).error || "Could not join.");
    }
  }

  if (loading) return <div className="skeleton card-skeleton" />;

  if (error || !preview) {
    return (
      <>
        <h1>This invite isn&apos;t valid</h1>
        <p className="subtitle">{error}</p>
        <p>
          <Link href="/circles">Your circles</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Join {preview.name}?</h1>
      <p className="subtitle">
        {preview.memberCount} {preview.memberCount === 1 ? "person is" : "people are"}{" "}
        already in it. Joining doesn&apos;t share anything of yours — you
        choose what to put in, one piece at a time, and can leave whenever.
      </p>
      <div className="row">
        <button onClick={join} disabled={busy}>
          {busy
            ? "Joining…"
            : preview.alreadyMember
              ? "Open it"
              : "Join this circle"}
        </button>
        <Link href="/circles">
          <button className="ghost">Not now</button>
        </Link>
      </div>
    </>
  );
}
