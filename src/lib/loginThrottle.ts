import { prisma } from "@/lib/db";
import { positiveIntFromEnv } from "@/lib/envNumber";

// Brute-force protection for sign-in. Without it, a password is only as strong
// as an attacker's patience — and the data behind it is somebody's private
// beliefs.
//
// Attempts are counted per (email, source IP). Two deliberate choices:
//   - Not per-email alone: that would let an attacker lock a real user out by
//     deliberately failing ten times (a denial-of-service, not a defence).
//   - Not a permanent lock: the window expires on its own, and a successful
//     sign-in clears the counter, so a user who just mistyped isn't stranded.
//
// This slows an attacker down enormously; it does not stop a large distributed
// botnet spread across thousands of addresses. That's the accepted tradeoff at
// this scale — the honest mitigation for that case is a strong password.

const MAX_ATTEMPTS = positiveIntFromEnv("LOGIN_MAX_ATTEMPTS", 10);
const WINDOW_MINUTES = positiveIntFromEnv("LOGIN_WINDOW_MINUTES", 15);

export type ThrottleResult =
  | { blocked: false }
  | { blocked: true; error: string; retryAfterSeconds: number };

function windowStart(): Date {
  return new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
}

// Best-effort client address. Behind a proxy (Vercel, nginx) the real client is
// in x-forwarded-for; the first entry is the original client.
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function checkLoginThrottle(
  email: string,
  ip: string
): Promise<ThrottleResult> {
  const recent = await prisma.loginAttempt.count({
    where: { email, ip, createdAt: { gte: windowStart() } },
  });

  if (recent >= MAX_ATTEMPTS) {
    return {
      blocked: true,
      error: `Too many failed sign-in attempts. Try again in ${WINDOW_MINUTES} minutes.`,
      retryAfterSeconds: WINDOW_MINUTES * 60,
    };
  }
  return { blocked: false };
}

export async function recordFailedLogin(
  email: string,
  ip: string
): Promise<void> {
  await prisma.loginAttempt.create({ data: { email, ip } });
}

export async function clearLoginAttempts(
  email: string,
  ip: string
): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { email, ip } });
}

// Opportunistic cleanup so the table doesn't grow without bound. Cheap enough
// to run on a successful sign-in.
export async function pruneOldLoginAttempts(): Promise<void> {
  await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: windowStart() } },
  });
}
