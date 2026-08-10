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
      reads: { where: { userId } },
      _count: { select: { shares: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

// How much has appeared in a circle since this person last looked.
//
// Counts only other people's activity — your own shares and replies are not
// news to you. A circle never seen before counts everything, so joining shows
// you there's something to read.
export async function unreadCount(
  circleId: string,
  userId: string,
  lastSeenAt: Date | null
): Promise<number> {
  const since = lastSeenAt ? { gt: lastSeenAt } : undefined;

  const [shares, comments] = await Promise.all([
    prisma.share.count({
      where: {
        circleId,
        hiddenAt: null,
        userId: { not: userId },
        ...(since ? { createdAt: since } : {}),
      },
    }),
    prisma.shareComment.count({
      where: {
        share: { circleId, hiddenAt: null },
        userId: { not: userId },
        deletedAt: null,
        ...(since ? { createdAt: since } : {}),
      },
    }),
  ]);

  return shares + comments;
}

// Opening a circle marks it read. Deliberately not exposed to other members:
// no read receipts, no "seen at", nothing that turns reading someone's
// reasoning into a social obligation to reply.
export async function markRead(circleId: string, userId: string) {
  await prisma.circleRead.upsert({
    where: { circleId_userId: { circleId, userId } },
    create: { circleId, userId, lastSeenAt: new Date() },
    update: { lastSeenAt: new Date() },
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
  // A bound invite is single-use: once claimed, the link is spent even if it
  // hasn't expired, so forwarding it afterwards gets the next person nothing.
  if (invite.claimedAt) return null;
  return invite;
}

// A bound invite names the one person allowed to accept it. Comparison is on
// the normalized address, matching how accounts are stored.
export function inviteAllows(
  invite: { email: string | null },
  userEmail: string
): boolean {
  if (!invite.email) return true;
  return invite.email.trim().toLowerCase() === userEmail.trim().toLowerCase();
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
