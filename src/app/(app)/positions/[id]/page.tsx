"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/format";

type Node = {
  id: string;
  parentId: string | null;
  claim: string;
  isBedrock: boolean;
  axiomId: string | null;
  axiomStatement: string | null;
  createdAt: string;
};

type Shift = {
  axiomId: string;
  statement: string;
  kind: "revised" | "retired";
  at: string;
};

type Position = {
  id: string;
  statement: string;
  settled: boolean;
  inQuestion: boolean;
  inQuestionBecause: string;
  shifts: Shift[];
  createdAt: string;
  nodes: Node[];
};

type Axiom = { id: string; statement: string };

export default function PositionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [position, setPosition] = useState<Position | null>(null);
  const [axioms, setAxioms] = useState<Axiom[]>([]);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // Which node is being marked bedrock, so we can offer existing axioms.
  const [marking, setMarking] = useState<string | null>(null);

  async function load() {
    const [pRes, aRes] = await Promise.all([
      fetch(`/api/positions/${id}`),
      fetch("/api/axioms"),
    ]);
    if (pRes.ok) setPosition((await pRes.json()).position);
    else setGone(true);
    if (aRes.ok) setAxioms((await aRes.json()).axioms);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // The key is the node being answered; "root" answers the position itself.
  async function answer(parentId: string | null) {
    const key = parentId ?? "root";
    const claim = (drafts[key] ?? "").trim();
    if (!claim) return;
    setError(null);
    const res = await fetch(`/api/positions/${id}/nodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim, parentId }),
    });
    if (res.ok) {
      setDrafts((d) => ({ ...d, [key]: "" }));
      load();
    } else {
      setError((await res.json().catch(() => ({}))).error || "Could not save.");
    }
  }

  async function setBedrock(nodeId: string, axiomId?: string) {
    setError(null);
    const res = await fetch(`/api/positions/${id}/nodes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId, isBedrock: true, axiomId }),
    });
    if (res.ok) {
      setMarking(null);
      load();
    } else {
      setError((await res.json().catch(() => ({}))).error || "Could not mark.");
    }
  }

  async function unsetBedrock(nodeId: string) {
    await fetch(`/api/positions/${id}/nodes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId, isBedrock: false }),
    });
    load();
  }

  async function removeNode(nodeId: string) {
    if (!window.confirm("Remove this step and everything resting on it?")) return;
    await fetch(`/api/positions/${id}/nodes`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId }),
    });
    load();
  }

  async function toggleSettled() {
    if (!position) return;
    await fetch(`/api/positions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settled: !position.settled }),
    });
    load();
  }

  async function removePosition() {
    if (!window.confirm("Delete this position and its whole chain?")) return;
    const res = await fetch(`/api/positions/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/positions");
  }

  if (loading) return <div className="skeleton card-skeleton" />;

  if (gone || !position) {
    return (
      <>
        <h1>Not found</h1>
        <p>
          <Link href="/positions">Back to your positions</Link>
        </p>
      </>
    );
  }

  const childrenOf = (parentId: string | null) =>
    position.nodes.filter((n) => n.parentId === parentId);

  // The recursive render IS the interrogation: every non-bedrock leaf gets a
  // "why?" box, so an unfinished chain is visibly unfinished.
  function renderNode(node: Node, depth: number) {
    const kids = childrenOf(node.id);
    const key = node.id;

    return (
      <div key={node.id} className="why-node" style={{ marginLeft: depth ? 20 : 0 }}>
        <div className={`why-claim${node.isBedrock ? " bedrock" : ""}`}>
          <div className="body-text">{node.claim}</div>

          {node.isBedrock ? (
            <div className="card-actions">
              <span className="meta">
                Bedrock — nothing underneath it
                {node.axiomStatement && " · counted as an axiom"}
              </span>
              <button className="ghost" onClick={() => unsetBedrock(node.id)}>
                Actually, there is something
              </button>
            </div>
          ) : (
            <>
              {kids.length === 0 && (
                <div className="why-ask">
                  <label htmlFor={`why-${key}`}>Why?</label>
                  <textarea
                    id={`why-${key}`}
                    placeholder="Because…"
                    value={drafts[key] ?? ""}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [key]: e.target.value }))
                    }
                  />
                  <div className="row" style={{ marginTop: 10 }}>
                    <button
                      onClick={() => answer(node.id)}
                      disabled={!(drafts[key] ?? "").trim()}
                    >
                      Because…
                    </button>
                    {marking === node.id ? (
                      <span className="row" style={{ gap: 6 }}>
                        <button className="ghost" onClick={() => setBedrock(node.id)}>
                          It&apos;s a new one
                        </button>
                        {axioms.map((a) => (
                          <button
                            key={a.id}
                            className="chip"
                            onClick={() => setBedrock(node.id, a.id)}
                          >
                            {a.statement}
                          </button>
                        ))}
                        <button className="link" onClick={() => setMarking(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button className="ghost" onClick={() => setMarking(node.id)}>
                        Nothing underneath this
                      </button>
                    )}
                    <span className="spacer" />
                    <button className="link" onClick={() => removeNode(node.id)}>
                      Remove
                    </button>
                  </div>
                  {marking === node.id && (
                    <p className="footnote">
                      If this is somewhere you&apos;ve already landed, pick it —
                      that&apos;s how you find out the same few things sit under
                      everything.
                    </p>
                  )}
                </div>
              )}
              {kids.map((k) => renderNode(k, depth + 1))}
            </>
          )}
        </div>
      </div>
    );
  }

  const roots = childrenOf(null);

  return (
    <>
      <h1>{position.statement}</h1>
      <p className="subtitle">
        {roots.length === 0
          ? "Why do you hold this? Answer, and you'll be asked why of the answer."
          : "Keep going until each branch reaches something with no reason underneath it."}
      </p>

      {position.inQuestion && (
        <div className="card notice-card">
          <div className="title">This was settled against different ground</div>
          <div className="body-text">
            {position.inQuestionBecause} What you argued down to isn&apos;t
            quite what it was when you settled, so the argument above may or
            may not still hold. Reading it again is the only way to know — and
            if it does still hold, settling it again says so.
          </div>
          <ul className="plain-list">
            {position.shifts.map((sh) => (
              <li key={sh.axiomId}>
                &ldquo;{sh.statement}&rdquo;{" "}
                <span className="meta">
                  ({sh.kind === "retired" ? "no longer held" : "reworded"} on{" "}
                  {formatDate(sh.at)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div aria-live="polite">{error && <div className="error">{error}</div>}</div>

      {roots.length === 0 ? (
        <div className="card-form">
          <label htmlFor="why-root">Why?</label>
          <textarea
            id="why-root"
            placeholder="Because…"
            value={drafts["root"] ?? ""}
            onChange={(e) => setDrafts((d) => ({ ...d, root: e.target.value }))}
            style={{ minHeight: 90 }}
          />
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => answer(null)}
              disabled={!(drafts["root"] ?? "").trim()}
            >
              Because…
            </button>
          </div>
        </div>
      ) : (
        <div className="why-tree">{roots.map((r) => renderNode(r, 0))}</div>
      )}

      {roots.length > 0 && (
        <div className="card-form" style={{ marginTop: 24 }}>
          <label htmlFor="why-another">Another reason for the position itself</label>
          <textarea
            id="why-another"
            placeholder="Because… (a separate branch)"
            value={drafts["root"] ?? ""}
            onChange={(e) => setDrafts((d) => ({ ...d, root: e.target.value }))}
          />
          <div className="row" style={{ marginTop: 14 }}>
            <button
              className="ghost"
              onClick={() => answer(null)}
              disabled={!(drafts["root"] ?? "").trim()}
            >
              Add branch
            </button>
            <span className="spacer" />
            <button className="ghost" onClick={toggleSettled}>
              {position.settled ? "Reopen this" : "I've reached the bottom"}
            </button>
            <button className="link" onClick={removePosition}>
              Delete
            </button>
          </div>
        </div>
      )}
    </>
  );
}
