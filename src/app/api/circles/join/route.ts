import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { safeDecrypt } from "@/lib/crypto";
import { inviteAllows, resolveInvite } from "@/lib/circles";

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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // A bound invite meant for someone else reads as invalid rather than
  // "valid, but not for you" — there's no reason to confirm to the holder
  // that a circle exists behind a link they can't use.
  if (!inviteAllows(invite, user.email)) {
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
      boundToYou: invite.email !== null,
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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user || !inviteAllows(invite, user.email)) {
    return NextResponse.json(
      { error: "That invite link is no longer valid." },
      { status: 404 }
    );
  }

  // Joining twice is a no-op rather than an error — re-clicking a link you
  // already used shouldn't look like a failure.
  await prisma.$transaction([
    prisma.circleMember.upsert({
      where: { circleId_userId: { circleId: invite.circleId, userId } },
      create: { circleId: invite.circleId, userId, role: "member" },
      update: {},
    }),
    // Burn a bound invite. Unbound links stay live until they expire or are
    // revoked, which is the point of them.
    ...(invite.email
      ? [
          prisma.circleInvite.update({
            where: { id: invite.id },
            data: { claimedById: userId, claimedAt: new Date() },
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ ok: true, circleId: invite.circleId });
}
