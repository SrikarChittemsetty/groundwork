import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { safeDecrypt } from "@/lib/crypto";
import { resolveInvite } from "@/lib/circles";

// Preview an invite before accepting: you should know what room you're being
// asked into before you're in it. Shows the name and size only — never the
// contents, which are for members.
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "No invite." }, { status: 400 });

  const invite = await resolveInvite(token);
  if (!invite) {
    return NextResponse.json(
      { error: "That invite link is no longer valid." },
      { status: 404 }
    );
  }

  const memberCount = await prisma.circleMember.count({
    where: { circleId: invite.circleId },
  });
  const already = await prisma.circleMember.findUnique({
    where: { circleId_userId: { circleId: invite.circleId, userId } },
    select: { id: true },
  });

  return NextResponse.json({
    circle: {
      id: invite.circleId,
      name: safeDecrypt(invite.circle.name),
      memberCount,
      alreadyMember: already !== null,
    },
  });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await req.json().catch(() => ({}));
  if (typeof token !== "string" || !token) {
    return NextResponse.json({ error: "No invite." }, { status: 400 });
  }

  const invite = await resolveInvite(token);
  if (!invite) {
    return NextResponse.json(
      { error: "That invite link is no longer valid." },
      { status: 404 }
    );
  }

  // Joining twice is a no-op rather than an error — re-clicking a link you
  // already used shouldn't look like a failure.
  await prisma.circleMember.upsert({
    where: { circleId_userId: { circleId: invite.circleId, userId } },
    create: { circleId: invite.circleId, userId, role: "member" },
    update: {},
  });

  return NextResponse.json({ ok: true, circleId: invite.circleId });
}
