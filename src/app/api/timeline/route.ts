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
    };

// A merged chronological feed of value statements (including every later
// rewording) and logged decisions, so the user can see their own history laid
// out plainly — including how their stated values shifted over time.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [valueRows, decisionRows] = await Promise.all([
    prisma.value.findMany({
      where: { userId },
      include: { versions: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.decision.findMany({
      where: { userId },
      include: { values: { include: { value: true } } },
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

  const items: TimelineItem[] = [
    ...valueItems,
    ...decisionRows.map((d) => ({
      kind: "decision" as const,
      id: d.id,
      body: safeDecrypt(d.body),
      at: d.occurredAt,
      linkedValues: d.values.map((link) => safeDecrypt(link.value.title)),
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return NextResponse.json({ items });
}
