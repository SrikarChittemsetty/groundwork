import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { isOwner } from "@/lib/circles";

// Remove someone from a circle.
//
// Owner-only, because "I can eject you" is real power and shouldn't be
// symmetric in a room built on people showing each other honest things. The
// alternative before this existed was deleting the whole circle, which
// punished everyone for one person.
//
// Removal takes their shares with them, exactly as leaving does — nothing of
// theirs stays in a room they're no longer in. Their own private records are
// untouched; only the shared copies go.
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await isOwner(params.id, userId))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { memberId } = await req.json().catch(() => ({}));
  if (typeof memberId !== "string" || !memberId) {
    return NextResponse.json({ error: "Which member?" }, { status: 400 });
  }

  if (memberId === userId) {
    return NextResponse.json(
      {
        error:
          "You can't remove yourself. Delete the circle instead if you're done with it.",
      },
      { status: 400 }
    );
  }

  const membership = await prisma.circleMember.findUnique({
    where: { circleId_userId: { circleId: params.id, userId: memberId } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.share.deleteMany({ where: { circleId: params.id, userId: memberId } }),
    prisma.circleMember.delete({
      where: { circleId_userId: { circleId: params.id, userId: memberId } },
    }),
    // Any invite bound to them, or that they claimed, stops working too —
    // otherwise removing someone would be undone by the link still in their
    // inbox.
    prisma.circleInvite.updateMany({
      where: { circleId: params.id, claimedById: memberId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
