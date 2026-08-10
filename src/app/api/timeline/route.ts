import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { safeDecrypt } from "@/lib/crypto";

export type TimelineItem =
  | {
      kind: "value";
      id: string;
      title: string;
      body: string;
      at: Date;
      // True when this entry is a later rewording of a value already stated.
      revised: boolean;
    }
  | {
      kind: "decision";
      id: string;
      body: string;
      at: Date;
      // Titles of the values the user said this decision bears on.
      linkedValues: string[];
    }
  | {
      kind: "position";
      id: string;
      body: string;
      at: Date;
      // Settling is its own moment in the record, so a position appears twice:
      // once when you took it apart, once when you decided it was done.
      event: "opened" | "settled";
    }
  | {
      kind: "axiom";
      id: string;
      body: string;
      at: Date;
      // Reaching bedrock, rewording it, and stopping holding it are three
      // different events and read very differently in a history.
      event: "reached" | "reworded" | "retired";
      // For a rewording: what it said before.
      previously?: string;
    }
  | {
      kind: "tension";
      id: string;
      body: string;
      at: Date;
      between: [string, string];
      event: "noted" | "resolved";
    };

// A merged chronological feed of everything you've done here.
//
// This used to carry only values and decisions, which left the actual spine of
// the tool — positions taken apart, bedrock reached, axioms reworded or
// dropped — out of the one view meant to show you your own history. A record
// of your thinking that omits the thinking is not much of a record.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [valueRows, decisionRows, positionRows, axiomRows, tensionRows] =
    await Promise.all([
      prisma.value.findMany({
        where: { userId },
        include: { versions: { orderBy: { createdAt: "asc" } } },
      }),
      prisma.decision.findMany({
        where: { userId },
        include: { values: { include: { value: true } } },
      }),
      prisma.position.findMany({ where: { userId } }),
      prisma.axiom.findMany({
        where: { userId },
        include: { versions: { orderBy: { createdAt: "asc" } } },
      }),
      prisma.axiomTension.findMany({
        where: { userId },
        include: { a: true, b: true },
      }),
    ]);

  const valueItems: TimelineItem[] = [];
  for (const v of valueRows) {
    if (v.versions.length === 0) {
      // Predates versioning: show the current wording as the original statement.
      valueItems.push({
        kind: "value",
        id: v.id,
        title: safeDecrypt(v.title),
        body: safeDecrypt(v.body),
        at: v.createdAt,
        revised: false,
      });
      continue;
    }
    v.versions.forEach((ver, i) => {
      valueItems.push({
        kind: "value",
        id: ver.id,
        title: safeDecrypt(ver.title),
        body: safeDecrypt(ver.body),
        at: ver.createdAt,
        revised: i > 0,
      });
    });
  }

  const positionItems: TimelineItem[] = [];
  for (const p of positionRows) {
    const body = safeDecrypt(p.statement);
    positionItems.push({
      kind: "position",
      id: p.id,
      body,
      at: p.createdAt,
      event: "opened",
    });
    if (p.settledAt) {
      positionItems.push({
        kind: "position",
        id: `${p.id}-settled`,
        body,
        at: p.settledAt,
        event: "settled",
      });
    }
  }

  const axiomItems: TimelineItem[] = [];
  for (const a of axiomRows) {
    // The wording at each point in time, so a rewording can say what it
    // replaced rather than just that something changed.
    const wordings = [
      ...a.versions.map((v) => safeDecrypt(v.statement)),
      safeDecrypt(a.statement),
    ];
    axiomItems.push({
      kind: "axiom",
      id: a.id,
      body: wordings[0],
      at: a.createdAt,
      event: "reached",
    });
    a.versions.forEach((v, i) => {
      // AxiomVersion holds the OUTGOING wording, stamped when it was replaced,
      // so the new wording is the next one along.
      axiomItems.push({
        kind: "axiom",
        id: `${a.id}-rev-${i}`,
        body: wordings[i + 1],
        previously: wordings[i],
        at: v.createdAt,
        event: "reworded",
      });
    });
    if (a.retiredAt) {
      axiomItems.push({
        kind: "axiom",
        id: `${a.id}-retired`,
        body: wordings[wordings.length - 1],
        at: a.retiredAt,
        event: "retired",
      });
    }
  }

  const tensionItems: TimelineItem[] = [];
  for (const t of tensionRows) {
    const between: [string, string] = [
      safeDecrypt(t.a.statement),
      safeDecrypt(t.b.statement),
    ];
    tensionItems.push({
      kind: "tension",
      id: t.id,
      body: safeDecrypt(t.note),
      at: t.createdAt,
      between,
      event: "noted",
    });
    if (t.resolvedAt && t.resolution) {
      tensionItems.push({
        kind: "tension",
        id: `${t.id}-resolved`,
        body: safeDecrypt(t.resolution),
        at: t.resolvedAt,
        between,
        event: "resolved",
      });
    }
  }

  const items: TimelineItem[] = [
    ...valueItems,
    ...decisionRows.map((d) => ({
      kind: "decision" as const,
      id: d.id,
      body: safeDecrypt(d.body),
      at: d.occurredAt,
      linkedValues: d.values.map((link) => safeDecrypt(link.value.title)),
    })),
    ...positionItems,
    ...axiomItems,
    ...tensionItems,
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return NextResponse.json({ items });
}
