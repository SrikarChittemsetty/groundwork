import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { safeDecrypt } from "@/lib/crypto";
import { parseChain } from "@/lib/sharedChain";
import { isMember, markRead } from "@/lib/circles";

// The circle itself: who's in it, what's been shared, and the comments.
//
// A non-member gets 404, not 403 — whether a circle exists is itself something
// only its members should know.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await isMember(params.id, userId))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const circle = await prisma.circle.findUnique({
    where: { id: params.id },
    include: {
      members: true,
      shares: {
        // Hidden shares are visible to nobody, including their author's
        // circle-mates. The author manages them from their own pages.
        where: { hiddenAt: null },
        orderBy: { createdAt: "desc" },
        include: {
          comments: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
  if (!circle) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Members are shown by email so people can tell each other apart. Everyone
  // here has deliberately joined the same small room.
  const users = await prisma.user.findMany({
    where: { id: { in: circle.members.map((m) => m.userId) } },
    select: { id: true, email: true },
  });
  const emailFor = new Map(users.map((u) => [u.id, u.email]));

  // Opening the circle is what marks it read.
  await markRead(circle.id, userId);

  return NextResponse.json({
    circle: {
      id: circle.id,
      name: safeDecrypt(circle.name),
      isOwner: circle.ownerId === userId,
      members: circle.members.map((m) => ({
        userId: m.userId,
        email: emailFor.get(m.userId) ?? "(unknown)",
        role: m.role,
        isYou: m.userId === userId,
      })),
      shares: circle.shares.map((s) => ({
        id: s.id,
        kind: s.kind,
        isYours: s.userId === userId,
        author: emailFor.get(s.userId) ?? "(unknown)",
        title: s.title ? safeDecrypt(s.title) : null,
        // Respect the sharer's per-share choices on the way out, so a field
        // they excluded never reaches another member's browser at all.
        body: s.showBody && s.body ? safeDecrypt(s.body) : null,
        // Parsed here rather than in the browser: the chain is ciphertext, and
        // the sharer's showChain choice decides whether it leaves the server.
        chain: s.showChain ? parseChain(s.chain) : [],
        note: s.showNote && s.note ? safeDecrypt(s.note) : null,
        occurredAt: s.occurredAt,
        createdAt: s.createdAt,
        comments: s.comments.map((c) => ({
          id: c.id,
          author: emailFor.get(c.userId) ?? "(unknown)",
          isYours: c.userId === userId,
          body: safeDecrypt(c.body),
          createdAt: c.createdAt,
        })),
      })),
    },
  });
}

// Leaving. The owner can't leave their own circle — they delete it instead,
// so a circle is never left without anyone who can manage it.
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const circle = await prisma.circle.findUnique({ where: { id: params.id } });
  if (!circle || !(await isMember(params.id, userId))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (circle.ownerId === userId) {
    // Deleting takes the shares and comments with it (cascade). Everyone's
    // own private records are untouched — only the shared copies go.
    await prisma.circle.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true, deleted: true });
  }

  // Leaving takes your shares out with you. Nothing of yours stays in a room
  // you've left.
  await prisma.$transaction([
    prisma.share.deleteMany({ where: { circleId: params.id, userId } }),
    prisma.circleMember.delete({
      where: { circleId_userId: { circleId: params.id, userId } },
    }),
  ]);

  return NextResponse.json({ ok: true, left: true });
}
