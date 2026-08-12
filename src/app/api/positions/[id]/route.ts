import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt, safeDecrypt } from "@/lib/crypto";
import { shiftsUnder, describeShifts } from "@/lib/derive";

// One position with its whole reason tree.
//
// The client renders the interrogation from this: any node that isn't bedrock
// and has no children is a place you were asked why and haven't answered yet.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const position = await prisma.position.findFirst({
    where: { id: params.id, userId },
    include: {
      nodes: {
        orderBy: { createdAt: "asc" },
        include: { axiom: true },
      },
    },
  });
  if (!position) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // The axioms this argument bottoms out in, and whether any has moved since
  // the position was settled. Same computation as the list, so a position
  // can't look settled here and in question there.
  const restsOn = [
    ...new Map(
      position.nodes
        .filter((n) => n.axiom)
        .map((n) => [
          n.axiom!.id,
          { ...n.axiom!, statement: safeDecrypt(n.axiom!.statement) },
        ])
    ).values(),
  ];
  const shifts = shiftsUnder(
    { id: position.id, settledAt: position.settledAt },
    restsOn
  );

  return NextResponse.json({
    position: {
      id: position.id,
      statement: safeDecrypt(position.statement),
      settled: position.settledAt !== null,
      inQuestion: shifts.length > 0,
      inQuestionBecause: describeShifts(shifts),
      shifts,
      createdAt: position.createdAt,
      nodes: position.nodes.map((n) => ({
        id: n.id,
        parentId: n.parentId,
        claim: safeDecrypt(n.claim),
        isBedrock: n.isBedrock,
        axiomId: n.axiomId,
        axiomStatement: n.axiom ? safeDecrypt(n.axiom.statement) : null,
        createdAt: n.createdAt,
      })),
    },
  });
}

// Mark the whole position settled, or reopen it. Settling is a claim that
// every branch reached bedrock — the tool doesn't decide that for you.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { settled, statement } = await req.json().catch(() => ({}));

  // Rewording the position you're interrogating. Kept without history for the
  // same reason a reason-step is: this is the argument's own text, not a
  // commitment something else rests on. It also deliberately doesn't unsettle
  // the position — un-settling someone's conclusion on their behalf is a
  // verdict, and the tool doesn't hand those down.
  if (typeof statement === "string") {
    const next = statement.trim();
    if (!next) {
      return NextResponse.json(
        { error: "A position needs to say something." },
        { status: 400 }
      );
    }
    const updated = await prisma.position.updateMany({
      where: { id: params.id, userId },
      data: { statement: encrypt(next) },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, statement: next });
  }

  if (typeof settled !== "boolean") {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const result = await prisma.position.updateMany({
    where: { id: params.id, userId },
    data: { settledAt: settled ? new Date() : null },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await prisma.position.deleteMany({
    where: { id: params.id, userId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
