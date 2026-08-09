"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";

type Item =
  | {
      kind: "value";
      id: string;
      title: string;
      body: string;
      at: string;
      revised: boolean;
    }
  | {
      kind: "decision";
      id: string;
      body: string;
      at: string;
      linkedValues: string[];
    };

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

// Group consecutive entries under the month they fall in, preserving order.
function groupByMonth(items: Item[]): { month: string; items: Item[] }[] {
  const groups: { month: string; items: Item[] }[] = [];
  for (const item of items) {
    const month = monthLabel(item.at);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(item);
    else groups.push({ month, items: [item] });
  }
  return groups;
}

export default function TimelinePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/timeline");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
      }
      setLoading(false);
    })();
  }, []);

  const valuesStated = new Set(
    items.filter((i) => i.kind === "value" && !i.revised).map((i) => i.id)
  ).size;
  const revisions = items.filter((i) => i.kind === "value" && i.revised).length;
  const decisions = items.filter((i) => i.kind === "decision").length;

  const groups = groupByMonth(items);

  return (
    <>
      <h1>Timeline</h1>
      <p className="subtitle">
        Your values and decisions laid out plainly, newest first. This is your
        history to interpret — the tool doesn&apos;t judge it for you.
      </p>

      {loading ? (
        <>
          <div className="skeleton card-skeleton" />
          <div className="skeleton card-skeleton" />
          <div className="skeleton card-skeleton" />
        </>
      ) : items.length === 0 ? (
        <div className="empty">
          <p>
            <strong>Your timeline is empty.</strong>
          </p>
          <p className="notice">
            It fills in as you go: every value you state (and every time you
            reword one) and every decision you log, in the order they happened.
          </p>
          <p className="notice">
            <Link href="/values">Write a value</Link> or{" "}
            <Link href="/log">log a decision</Link> to start it.
          </p>
        </div>
      ) : (
        <>
          {/* Plain counts, deliberately not a score of any kind. */}
          <div className="stats">
            <div className="stat">
              <div className="stat-num">{valuesStated}</div>
              <div className="stat-label">
                {valuesStated === 1 ? "Value" : "Values"}
              </div>
            </div>
            <div className="stat">
              <div className="stat-num">{revisions}</div>
              <div className="stat-label">
                {revisions === 1 ? "Revision" : "Revisions"}
              </div>
            </div>
            <div className="stat">
              <div className="stat-num">{decisions}</div>
              <div className="stat-label">
                {decisions === 1 ? "Decision" : "Decisions"}
              </div>
            </div>
          </div>

          <div className="timeline">
            {groups.map((group) => (
              <div key={group.month}>
                <div className="tl-month">{group.month}</div>
                {group.items.map((it) => {
                  const nodeClass =
                    it.kind === "decision"
                      ? "is-decision"
                      : it.revised
                        ? "is-revised"
                        : "is-value";
                  return (
                    <div
                      key={`${it.kind}-${it.id}`}
                      className={`tl-entry ${nodeClass}`}
                    >
                      <div className="card interactive">
                        <div className="tl-head">
                          <span
                            className={`tag ${it.kind}${
                              it.kind === "value" && it.revised
                                ? " revised"
                                : ""
                            }`}
                          >
                            {it.kind === "value"
                              ? it.revised
                                ? "Reworded"
                                : "Value stated"
                              : "Decision"}
                          </span>
                          <span className="meta">{formatDate(it.at)}</span>
                        </div>

                        {it.kind === "value" ? (
                          <>
                            <div className="title">{it.title}</div>
                            <div className="body-text">{it.body}</div>
                          </>
                        ) : (
                          <>
                            <div className="body-text">{it.body}</div>
                            {it.linkedValues?.length > 0 && (
                              <div className="chips" style={{ marginTop: 12 }}>
                                <span
                                  className="footnote"
                                  style={{ margin: 0, marginRight: 2 }}
                                >
                                  Bears on
                                </span>
                                {it.linkedValues.map((t, i) => (
                                  <span key={i} className="chip static">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
