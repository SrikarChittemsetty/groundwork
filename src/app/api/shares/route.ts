import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt, safeDecrypt } from "@/lib/crypto";
import { isMember, readToken } from "@/lib/circles";

// Everything you have shared, so you can see at a glance what is visible to
// whom and pull any of it back. Includes hidden shares — they're yours, and
// you need to be able to find them to unhide them.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.share.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      circle: true,
      links: { where: { revokedAt: null } },
      _count: { select: { comments: true } },
    },
  });

  return NextResponse.json({
    shares: rows.map((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title ? safeDecrypt(s.title) : null,
      body: s.body ? safeDecrypt(s.body) : null,
      note: s.note ? safeDecrypt(s.note) : null,
      showBody: s.showBody,
      showNote: s.showNote,
      hidden: s.hiddenAt !== null,
      circleId: s.circleId,
      circleName: s.circle ? safeDecrypt(s.circle.name) : null,
      linkTokens: s.links.map((l) => readToken(l)),
      commentCount: s._count.comments,
      createdAt: s.createdAt,
    })),
  });
}

// Share a value or a decision. The content is snapshotted here rather than
// referenced, so what someone was shown stays what they were shown even if you
// later reword the original.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kind, sourceId, circleId, note, showBody, showNote } = await req
    .json()
    .catch(() => ({}));

  if (kind !== "value" && kind !== "decision") {
    return NextResponse.json({ error: "Share a value or a decision." }, { status: 400 });
  }
  if (typeof sourceId !== "string" || !sourceId) {
    return NextResponse.json({ error: "Nothing selected to share." }, { status: 400 });
  }

  // A circle is optional: a share with no circle exists only behind whatever
  // one-off links you make for it.
  if (circleId !== undefined && circleId !== null) {
    if (typeof circleId !== "string" || !(await isMember(circleId, userId))) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }

  let title: string | null = null;
  let body: string | null = null;
  let occurredAt: Date | null = null;

  if (kind === "value") {
    // Ownership check doubles as the fetch — you can only share your own.
    const value = await prisma.value.findFirst({
      where: { id: sourceId, userId },
    });
    if (!value) return NextResponse.json({ error: "Not found." }, { status: 404 });
    title = value.title;
    body = value.body;
  } else {
    const decision = await prisma.decision.findFirst({
      where: { id: sourceId, userId },
    });
    if (!decision) return NextResponse.json({ error: "Not found." }, { status: 404 });
    body = decision.body;
    occurredAt = decision.occurredAt;
  }

  const share = await prisma.share.create({
    data: {
      userId,
      circleId: typeof circleId === "string" ? circleId : null,
      kind,
      title,
      body,
      occurredAt,
      note:
        typeof note === "string" && note.trim() ? encrypt(note.trim()) : null,
      showBody: showBody !== false,
      showNote: showNote !== false,
    },
  });

  return NextResponse.json({ share: { id: share.id } });
}
