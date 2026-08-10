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
    }
  | {
      kind: "position";
      id: string;
      body: string;
      at: string;
      event: "opened" | "settled";
    }
  | {
      kind: "axiom";
      id: string;
      body: string;
      at: string;
      event: "reached" | "reworded" | "retired";
      previously?: string;
    }
  | {
      kind: "tension";
      id: string;
      body: string;
      at: string;
      between: [string, string];
      event: "noted" | "resolved";
    };

// What each entry is called in the feed. Kept in one place because the label
// is the only thing distinguishing several of these at a glance.
function label(it: Item): string {
  switch (it.kind) {
    case "value":
      return it.revised ? "Reworded" : "Value stated";
    case "decision":
      return "Decision";
    case "position":
      return it.event === "opened" ? "Position taken apart" : "Settled";
    case "axiom":
      return it.event === "reached"
        ? "Bedrock reached"
        : it.event === "reworded"
          ? "Axiom reworded"
          : "No longer held";
    case "tension":
      return it.event === "noted" ? "Tension noted" : "Tension resolved";
  }
}

// Which dot the entry gets on the rail.
function nodeClass(it: Item): string {
  switch (it.kind) {
    case "value":
      return it.revised ? "is-revised" : "is-value";
    case "decision":
      return "is-decision";
    case "position":
      return "is-position";
    case "axiom":
      return it.event === "reached" ? "is-axiom" : "is-revised";
    case "tension":
      return "is-tension";
  }
}

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

type Filter = "all" | "reasoning" | "values" | "decisions";

const REASONING = new Set(["position", "axiom", "tension"]);

export default function TimelinePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

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

  // Counts describe the whole record, not the current filter — otherwise
  // narrowing the view would look like the history itself had shrunk.
  const valuesStated = new Set(
    items.filter((i) => i.kind === "value" && !i.revised).map((i) => i.id)
  ).size;
  const revisions = items.filter((i) => i.kind === "value" && i.revised).length;
  const decisions = items.filter((i) => i.kind === "decision").length;
  const positions = items.filter(
    (i) => i.kind === "position" && i.event === "opened"
  ).length;
  const axioms = items.filter(
    (i) => i.kind === "axiom" && i.event === "reached"
  ).length;

  const visible = items.filter((i) =>
    filter === "all"
      ? true
      : filter === "reasoning"
        ? REASONING.has(i.kind)
        : filter === "values"
          ? i.kind === "value"
          : i.kind === "decision"
  );

  const groups = groupByMonth(visible);

  return (
    <>
      <h1>Timeline</h1>
      <p className="subtitle">
        Everything you&apos;ve done here, newest first: positions taken apart,
        bedrock reached, axioms reworded or dropped, values stated and
        reworded, decisions logged. This is your history to interpret — the
        tool doesn&apos;t judge it for you.
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
            It fills in as you go: every position you take apart, every place
            the asking stopped, every value you state or reword, and every
            decision you log — in the order they happened.
          </p>
          <p className="notice">
            <Link href="/positions">Take a position apart</Link>,{" "}
            <Link href="/values">write a value</Link>, or{" "}
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
            <div className="stat">
              <div className="stat-num">{positions}</div>
              <div className="stat-label">
                {positions === 1 ? "Position" : "Positions"}
              </div>
            </div>
            <div className="stat">
              <div className="stat-num">{axioms}</div>
              <div className="stat-label">
                {axioms === 1 ? "Axiom" : "Axioms"}
              </div>
            </div>
          </div>

          <div
            className="chips"
            role="group"
            aria-label="Filter timeline"
            style={{ marginBottom: 22 }}
          >
            {(
              [
                ["all", "Everything"],
                ["reasoning", "Reasoning"],
                ["values", "Values"],
                ["decisions", "Decisions"],
              ] as [Filter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`chip${filter === key ? " on" : ""}`}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="empty">
              <p className="notice">
                Nothing of that kind yet — your record still holds{" "}
                {items.length} {items.length === 1 ? "entry" : "entries"}.
              </p>
            </div>
          ) : (
          <div className="timeline">
            {groups.map((group) => (
              <div key={group.month}>
                <div className="tl-month">{group.month}</div>
                {group.items.map((it) => (
                  <div
                    key={`${it.kind}-${it.id}`}
                    className={`tl-entry ${nodeClass(it)}`}
                  >
                    <div className="card interactive">
                      <div className="tl-head">
                        <span
                          className={`tag ${it.kind}${
                            it.kind === "value" && it.revised ? " revised" : ""
                          }${
                            it.kind === "axiom" && it.event !== "reached"
                              ? " revised"
                              : ""
                          }`}
                        >
                          {label(it)}
                        </span>
                        <span className="meta">{formatDate(it.at)}</span>
                      </div>

                      {it.kind === "value" && (
                        <>
                          <div className="title">{it.title}</div>
                          <div className="body-text">{it.body}</div>
                        </>
                      )}

                      {it.kind === "decision" && (
                        <>
                          <div className="body-text">{it.body}</div>
                          {it.linkedValues.length > 0 && (
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

                      {it.kind === "position" && (
                        <>
                          <div className="title">
                            <Link href={`/positions/${it.id.split("-")[0]}`}>
                              {it.body}
                            </Link>
                          </div>
                          <div className="footnote">
                            {it.event === "opened"
                              ? "Started asking why of it."
                              : "Every branch reached something with nothing underneath it."}
                          </div>
                        </>
                      )}

                      {it.kind === "axiom" && (
                        <>
                          <div className="title">{it.body}</div>
                          {it.event === "reworded" && it.previously && (
                            <div className="body-text shifted">
                              Previously: &ldquo;{it.previously}&rdquo;
                            </div>
                          )}
                          {it.event === "retired" && (
                            <div className="footnote">
                              You stopped holding this. What rests on it is
                              flagged on <Link href="/positions">Positions</Link>.
                            </div>
                          )}
                          {it.event === "reached" && (
                            <div className="footnote">
                              A place the asking stopped.
                            </div>
                          )}
                        </>
                      )}

                      {it.kind === "tension" && (
                        <>
                          <div className="footnote">
                            Between &ldquo;{it.between[0]}&rdquo; and &ldquo;
                            {it.between[1]}&rdquo;
                          </div>
                          <div className="body-text">{it.body}</div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          )}
        </>
      )}
    </>
  );
}
