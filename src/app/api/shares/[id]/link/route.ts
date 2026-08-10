import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { newToken } from "@/lib/circles";

// Mint a one-off link to a single share, for showing your reasoning to someone
// who isn't in any circle. Bearer token, view-only, revocable, and optionally
// expiring — handing someone a link shouldn't mean handing it over forever.
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const share = await prisma.share.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!share) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { expiresInDays } = await req.json().catch(() => ({}));
  let expiresAt: Date | null = null;
  if (typeof expiresInDays === "number" && Number.isFinite(expiresInDays)) {
    const days = Math.max(1, Math.min(365, Math.floor(expiresInDays)));
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  const link = await prisma.shareLink.create({
    data: { shareId: share.id, token: newToken(), createdById: userId, expiresAt },
  });

  return NextResponse.json({
    link: { token: link.token, expiresAt: link.expiresAt },
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await req.json().catch(() => ({}));

  // Scoped through the share's owner so you can only revoke your own links.
  const result = await prisma.shareLink.updateMany({
    where: {
      shareId: params.id,
      share: { userId },
      ...(typeof token === "string" && token ? { token } : {}),
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ ok: true, revoked: result.count });
}
