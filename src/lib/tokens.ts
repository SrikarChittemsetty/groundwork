import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Bearer tokens: circle invites, share links, password resets.
//
// All three are the same kind of object — a string that is, by itself, the
// entire authorization — so they get the same handling rather than three
// slightly different versions of it.
//
// The rule: a token is generated once, handed to the person once, and never
// stored in a form the database alone can produce. `hashToken` is what gets
// looked up. Where the owner needs to see their own link again (an invite
// they created, a share link they handed out), the token is *also* kept
// encrypted with the app key — which lives in the environment, not the
// database — so a stolen database file still yields nothing usable.
//
// SHA-256 without a salt is deliberate here and would be wrong for passwords.
// It has to be deterministic to serve as a lookup key, and 32 random bytes
// have nothing to guess: there is no dictionary of likely tokens to try.

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Constant-time compare, so a caller can't learn a hash prefix by timing.
export function hashesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
