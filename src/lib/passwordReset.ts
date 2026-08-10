import { prisma } from "@/lib/db";
import { newToken, hashToken, hashesMatch } from "@/lib/tokens";

// Password resets.
//
// The token is a bearer credential for an account holding someone's beliefs,
// so it gets treated like one: 32 bytes of entropy, stored only as a hash,
// single use, short-lived, and every outstanding token for the account is
// killed the moment any of them is spent.
//
// Unlike invites and share links, a reset token is never re-displayed — if
// you lose it you ask for another — so there is no encrypted copy of it.

export const RESET_TTL_HOURS = 1;

export const newResetToken = newToken;
export { hashToken, hashesMatch };

export async function createReset(userId: string): Promise<string> {
  const token = newResetToken();
  await prisma.passwordReset.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_HOURS * 60 * 60 * 1000),
    },
  });
  return token;
}

export type ResolvedReset = { id: string; userId: string };

// Returns the reset a token unlocks, or null. Expired, spent, and unknown
// tokens are all null — a caller shouldn't be able to tell which.
export async function resolveReset(
  token: string
): Promise<ResolvedReset | null> {
  if (!token) return null;
  const row = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { id: row.id, userId: row.userId };
}

// Spending a token also invalidates every other outstanding one for that
// account. Otherwise a second link — perhaps in an inbox someone else can
// reach — would still work after the account had already been recovered.
export async function consumeReset(resetId: string, userId: string) {
  const now = new Date();
  await prisma.$transaction([
    prisma.passwordReset.update({
      where: { id: resetId },
      data: { usedAt: now },
    }),
    prisma.passwordReset.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    }),
  ]);
}

// Changing a password by any route should strand outstanding reset links.
export async function invalidateResetsFor(userId: string) {
  await prisma.passwordReset.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
}
