import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt, safeDecrypt } from "@/lib/crypto";

// Reword an axiom, or stop holding it.
//
// This is the edit with the longest reach in the app. Everything you argued
// down to this point was settled against the wording it had at the time, so
// the old wording is kept and `revisedAt` is stamped — which is what puts the
// positions resting on it back in question. Overwriting silently would leave
// every one of those arguments looking exactly as settled as before while the
// thing underneath them had moved.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.axiom.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { statement, retired } = await req.json().catch(() => ({}));
  const now = new Date();
  const data: {
    statement?: string;
    revisedAt?: Date;
    retiredAt?: Date | null;
  } = {};

  if (typeof statement === "string") {
    const next = statement.trim();
    if (!next) {
      return NextResponse.json(
        { error: "An axiom can't be blank. Retire it instead." },
        { status: 400 }
      );
    }
    // Only a real change counts. Re-saving identical text shouldn't put
    // anyone's settled reasoning back in question.
    if (next !== safeDecrypt(existing.statement)) {
      data.statement = encrypt(next);
      data.revisedAt = now;
    }
  }

  // Retiring is not deleting: what you used to hold as bedrock, and what you
  // built on it, are both worth keeping. Un-retiring is allowed — people
  // return to things.
  if (typeof retired === "boolean") {
    if (retired && !existing.retiredAt) data.retiredAt = now;
    if (!retired && existing.retiredAt) data.retiredAt = null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const axiom = await prisma.$transaction(async (tx) => {
    // Snapshot the outgoing wording before it's replaced.
    if (data.statement) {
      await tx.axiomVersion.create({
        data: { axiomId: existing.id, userId, statement: existing.statement },
      });
    }
    return tx.axiom.update({ where: { id: existing.id }, data });
  });

  return NextResponse.json({
    axiom: {
      id: axiom.id,
      statement: safeDecrypt(axiom.statement),
      revisedAt: axiom.revisedAt,
      retiredAt: axiom.retiredAt,
    },
  });
}

// Deleting an axiom outright, for one recorded by mistake. Anything that
// bottomed out here stays bedrock with no axiom attached rather than
// vanishing — the reasoning happened either way. Retiring is almost always
// what you actually want.
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await prisma.axiom.deleteMany({
    where: { id: params.id, userId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
