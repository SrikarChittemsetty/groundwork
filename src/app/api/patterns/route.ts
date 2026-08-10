import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { safeDecrypt } from "@/lib/crypto";

// Observations derived by arithmetic, not inference. No model, no key, no cost.
//
// Everything here is a plain fact about the record — how long since a value
// last bore on anything you logged, how many times you've reworded it, which
// decisions you never tagged. Deliberately no scores, rankings, streaks, or
// "consistency" measures: the moment this counts up something you can be good
// or bad at, it becomes a thing to perform for, and the honesty that makes the
// record worth keeping is gone. The reader draws the conclusions.

const DAY = 24 * 60 * 60 * 1000;

function daysSince(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / DAY);
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [valueRows, decisionRows] = await Promise.all([
    prisma.value.findMany({
      where: { userId },
      include: {
        versions: { orderBy: { createdAt: "asc" } },
        decisions: { include: { decision: true } },
      },
    }),
    prisma.decision.findMany({
      where: { userId },
      include: { values: true },
      orderBy: { occurredAt: "desc" },
    }),
  ]);

  const values = valueRows.map((v) => {
    const linked = v.decisions
      .map((link) => link.decision)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const mostRecent = linked[0]?.occurredAt ?? null;

    return {
      id: v.id,
      title: safeDecrypt(v.title),
      statedAt: v.createdAt,
      // How many times the wording changed after first being stated.
      rewordings: Math.max(0, v.versions.length - 1),
      decisionCount: linked.length,
      lastBoreOnAt: mostRecent,
      daysSinceLastBoreOn: mostRecent ? daysSince(mostRecent) : null,
    };
  });

  const untaggedDecisions = decisionRows.filter(
    (d) => d.values.length === 0
  ).length;

  // Span of the record, and the longest gap between consecutive logged
  // decisions — a plain fact about when you were and weren't writing things
  // down, not a judgment about it.
  const dates = decisionRows.map((d) => d.occurredAt.getTime()).sort((a, b) => a - b);
  let longestGapDays: number | null = null;
  for (let i = 1; i < dates.length; i++) {
    const gap = Math.floor((dates[i] - dates[i - 1]) / DAY);
    if (longestGapDays === null || gap > longestGapDays) longestGapDays = gap;
  }

  return NextResponse.json({
    values,
    decisions: {
      total: decisionRows.length,
      untagged: untaggedDecisions,
      firstAt: dates.length > 0 ? new Date(dates[0]) : null,
      lastAt: dates.length > 0 ? new Date(dates[dates.length - 1]) : null,
      daysSinceLast:
        dates.length > 0 ? daysSince(new Date(dates[dates.length - 1])) : null,
      longestGapDays,
    },
  });
}
