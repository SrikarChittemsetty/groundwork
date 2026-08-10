import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

// Membership and access checks for sharing.
//
// This is the first and only place in the app where one person can read
// another person's writing, so every path in goes through here rather than
// being re-derived per route. The rule everywhere: you see a share if you are
// in its circle and it isn't hidden, or you hold a live link to it. There is
// no third way, and there is no way to browse a person rather than a circle.

export function newToken(): string {
  // 32 bytes of entropy, url-safe. These are bearer tokens — guessing one must
  // be infeasible, since holding it is the whole authorization.
  return randomBytes(32).toString("base64url");
}

export async function isMember(
  circleId: string,
  userId: string
): Promise<boolean> {
  const row = await prisma.circleMember.findUnique({
    where: { circleId_userId: { circleId, userId } },
    select: { id: true },
  });
  return row !== null;
}

export async function isOwner(
  circleId: string,
  userId: string
): Promise<boolean> {
  const row = await prisma.circleMember.findUnique({
    where: { circleId_userId: { circleId, userId } },
    select: { role: true },
  });
  return row?.role === "owner";
}

// Circles the user belongs to. Never lists circles they aren't in — there is
// no directory and nothing to discover.
export async function circlesFor(userId: string) {
  return prisma.circle.findMany({
    where: { members: { some: { userId } } },
    include: {
      members: { select: { userId: true, role: true, joinedAt: true } },
      _count: { select: { shares: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

// Resolve an invite token to a joinable circle, or null. Expired and revoked
// invites resolve to null rather than erroring differently, so a probe can't
// distinguish "wrong token" from "token that used to work".
export async function resolveInvite(token: string) {
  const invite = await prisma.circleInvite.findUnique({
    where: { token },
    include: { circle: true },
  });
  if (!invite) return null;
  if (invite.revokedAt) return null;
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return null;
  return invite;
}

// Resolve a public share link. Returns null for revoked, expired, hidden, or
// unknown — a link to something the owner has since hidden must stop working.
export async function resolveShareLink(token: string) {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { share: true },
  });
  if (!link) return null;
  if (link.revokedAt) return null;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;
  if (link.share.hiddenAt) return null;
  return link;
}
