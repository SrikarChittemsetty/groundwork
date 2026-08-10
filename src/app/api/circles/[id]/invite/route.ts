import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { isMember, newToken } from "@/lib/circles";

// Create an invite link. Any member can invite — a circle is a room you chose
// to be in together, not a hierarchy — but every invite is attributable and
// individually revocable.
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await isMember(params.id, userId))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { expiresInDays, email } = await req.json().catch(() => ({}));
  let expiresAt: Date | null = null;
  if (typeof expiresInDays === "number" && Number.isFinite(expiresInDays)) {
    const days = Math.max(1, Math.min(365, Math.floor(expiresInDays)));
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  // Naming an address makes the invite theirs alone and single-use. Leaving it
  // blank keeps the old bearer-link behaviour, which is still the right tool
  // when you just want to text a link to someone.
  let boundEmail: string | null = null;
  if (typeof email === "string" && email.trim()) {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) {
      return NextResponse.json(
        { error: "That doesn't look like an email address." },
        { status: 400 }
      );
    }
    boundEmail = normalized;
  }

  const invite = await prisma.circleInvite.create({
    data: {
      circleId: params.id,
      token: newToken(),
      createdById: userId,
      email: boundEmail,
      expiresAt,
    },
  });

  return NextResponse.json({
    invite: {
      token: invite.token,
      email: invite.email,
      expiresAt: invite.expiresAt,
    },
  });
}

// List live invites so you can see what's outstanding and pull any of them.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await isMember(params.id, userId))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const invites = await prisma.circleInvite.findMany({
    where: { circleId: params.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    invites: invites
      .filter((i) => !i.expiresAt || i.expiresAt.getTime() > Date.now())
      .map((i) => ({
        id: i.id,
        token: i.token,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
        isYours: i.createdById === userId,
      })),
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await isMember(params.id, userId))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { inviteId } = await req.json().catch(() => ({}));
  if (typeof inviteId !== "string") {
    return NextResponse.json({ error: "Which invite?" }, { status: 400 });
  }

  const result = await prisma.circleInvite.updateMany({
    where: { id: inviteId, circleId: params.id },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
