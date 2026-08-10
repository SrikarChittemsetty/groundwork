import { prisma } from "@/lib/db";

// Deleting an account, completely.
//
// This lives here rather than inline in the route so the test suite can run
// the real thing. A test that reimplements the deletion would pass while the
// route quietly diverged from it — which is how the first version of this
// shipped leaving five tables behind.
//
// Most of the work is done by `onDelete: Cascade` in the schema. What can't be
// is anything keyed by email rather than by user id, because there's no
// foreign key to hang a cascade on:
//
//   - LoginAttempt records the address against a source IP to throttle
//     password guessing. Nobody needs throttling against an account that no
//     longer exists.
//   - CircleInvite may name the address in an invitation someone *else* sent.
//     Their circle survives the deletion; the address in it shouldn't. Invites
//     created by this person go too — they're links into a room, issued by an
//     account that no longer exists.
//
// The distinction matters because the privacy page doesn't promise "your
// account is removed." It promises nothing is retained.
export async function purgeAccount(userId: string, email: string) {
  await prisma.$transaction([
    prisma.loginAttempt.deleteMany({ where: { email } }),
    prisma.circleInvite.deleteMany({ where: { email } }),
    prisma.circleInvite.deleteMany({ where: { createdById: userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}
