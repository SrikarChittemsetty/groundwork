"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";

type ValuePattern = {
  id: string;
  title: string;
  statedAt: string;
  rewordings: number;
  decisionCount: number;
  lastBoreOnAt: string | null;
  daysSinceLastBoreOn: number | null;
};

type Patterns = {
  values: ValuePattern[];
  decisions: {
    total: number;
    untagged: number;
    firstAt: string | null;
    lastAt: string | null;
    daysSinceLast: number | null;
    longestGapDays: number | null;
  };
};

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function PatternsPage() {
  const [data, setData] = useState<Patterns | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/patterns");
      if (res.ok) setData(await res.json());
      setLoading(false);
    })();
  }, []);

  const hasAnything =
    data && (data.values.length > 0 || data.decisions.total > 0);

  return (
    <>
      <h1>Patterns</h1>
      <p className="subtitle">
        Plain facts about your own record, worked out by counting — no AI, and
        nothing sent anywhere. They aren&apos;t findings. What they mean, if
        anything, is yours to decide.
      </p>

      {loading ? (
        <>
          <div className="skeleton card-skeleton" />
          <div className="skeleton card-skeleton" />
        </>
      ) : !hasAnything ? (
        <div className="empty">
          <p>
            <strong>Nothing to count yet.</strong>
          </p>
          <p className="notice">
            Once you&apos;ve written a <Link href="/values">value</Link> or two
            and logged some <Link href="/log">decisions</Link>, this page shows
            how they relate.
          </p>
        </div>
      ) : (
        <>
          <h2>Your values</h2>
          {data!.values.length === 0 ? (
            <div className="empty">
              <p className="notice">
                No values written down yet, so there&apos;s nothing to weigh
                decisions against.
              </p>
            </div>
          ) : (
            data!.values.map((v) => (
              <article key={v.id} className="card interactive">
                <div className="title">{v.title}</div>
                <ul className="facts">
                  <li>
                    {v.decisionCount === 0 ? (
                      <>
                        No decision you&apos;ve logged is tagged as bearing on
                        this.
                      </>
                    ) : (
                      <>
                        {plural(v.decisionCount, "decision bears", "decisions bear")}{" "}
                        on this.
                      </>
                    )}
                  </li>
                  {v.lastBoreOnAt && (
                    <li>
                      Last one was {formatDate(v.lastBoreOnAt)}
                      {v.daysSinceLastBoreOn !== null && (
                        <> — {plural(v.daysSinceLastBoreOn, "day", "days")} ago</>
                      )}
                      .
                    </li>
                  )}
                  <li>
                    {v.rewordings === 0 ? (
                      <>
                        Worded the same way since you stated it on{" "}
                        {formatDate(v.statedAt)}.
                      </>
                    ) : (
                      <>
                        Reworded {plural(v.rewordings, "time", "times")} since{" "}
                        {formatDate(v.statedAt)} —{" "}
                        <Link href="/values">see how it changed</Link>.
                      </>
                    )}
                  </li>
                </ul>
              </article>
            ))
          )}

          <h2>Your decisions</h2>
          <article className="card">
            <ul className="facts">
              <li>
                {plural(data!.decisions.total, "decision", "decisions")} logged
                {data!.decisions.firstAt && data!.decisions.lastAt && (
                  <>
                    , between {formatDate(data!.decisions.firstAt)} and{" "}
                    {formatDate(data!.decisions.lastAt)}
                  </>
                )}
                .
              </li>
              {data!.decisions.untagged > 0 && (
                <li>
                  {plural(data!.decisions.untagged, "decision isn't", "decisions aren't")}{" "}
                  tagged with any value. Tagging them on{" "}
                  <Link href="/log">the log</Link> is what connects them here.
                </li>
              )}
              {data!.decisions.daysSinceLast !== null && (
                <li>
                  Last logged{" "}
                  {data!.decisions.daysSinceLast === 0
                    ? "today"
                    : `${plural(data!.decisions.daysSinceLast, "day", "days")} ago`}
                  .
                </li>
              )}
              {data!.decisions.longestGapDays !== null &&
                data!.decisions.longestGapDays > 0 && (
                  <li>
                    Longest stretch between two logged decisions:{" "}
                    {plural(data!.decisions.longestGapDays, "day", "days")}.
                  </li>
                )}
            </ul>
          </article>

          <p className="footnote" style={{ marginTop: 20 }}>
            There&apos;s no score here on purpose. A number you could be good or
            bad at would turn this into something to perform for, and the
            honesty is the whole point.
          </p>
        </>
      )}
    </>
  );
}
