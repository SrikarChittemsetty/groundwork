import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { isMember } from "@/lib/circles";

// Comment on a share. Requires membership of the share's circle — a one-off
// public link is read-only, so someone holding a link can see your reasoning
// but cannot write back into the room.
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body } = await req.json().catch(() => ({}));
  if (typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "Write something first." }, { status: 400 });
  }
  if (body.length > 5000) {
    return NextResponse.json(
      { error: "Keep it under 5,000 characters." },
      { status: 400 }
    );
  }

  const share = await prisma.share.findUnique({ where: { id: params.id } });
  if (!share || share.hiddenAt || !share.circleId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!(await isMember(share.circleId, userId))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const comment = await prisma.shareComment.create({
    data: { shareId: share.id, userId, body: encrypt(body.trim()) },
  });

  return NextResponse.json({
    comment: { id: comment.id, body: body.trim(), createdAt: comment.createdAt },
  });
}

// Delete your own comment. Soft-deleted so a conversation doesn't silently
// lose its shape for everyone else mid-thread.
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { commentId } = await req.json().catch(() => ({}));
  if (typeof commentId !== "string") {
    return NextResponse.json({ error: "Which comment?" }, { status: 400 });
  }

  const result = await prisma.shareComment.updateMany({
    where: { id: commentId, shareId: params.id, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
