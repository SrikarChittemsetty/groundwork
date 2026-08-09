import { prisma } from "@/lib/db";

// Cost guard for the AI features. The app pays for inference, so a runaway
// loop (or an over-eager user) is a real budget problem — the build plan
// budgets $50-150/month for the product runtime.
//
// Counts are derived from the stored Reflection/Consultation rows rather than
// in-memory state, so limits survive restarts and work across serverless
// instances. Both features share one pool because both cost money.

const PER_HOUR = Number(process.env.AI_LIMIT_PER_HOUR ?? 15);
const PER_DAY = Number(process.env.AI_LIMIT_PER_DAY ?? 60);

export type RateLimitResult =
  | { ok: true }
  | { ok: false; error: string; retryAfterSeconds: number };

export async function checkAiRateLimit(
  userId: string
): Promise<RateLimitResult> {
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000);
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);

  const [reflHour, consHour, reflDay, consDay] = await Promise.all([
    prisma.reflection.count({ where: { userId, createdAt: { gte: hourAgo } } }),
    prisma.consultation.count({ where: { userId, createdAt: { gte: hourAgo } } }),
    prisma.reflection.count({ where: { userId, createdAt: { gte: dayAgo } } }),
    prisma.consultation.count({ where: { userId, createdAt: { gte: dayAgo } } }),
  ]);

  if (reflHour + consHour >= PER_HOUR) {
    return {
      ok: false,
      error: `You've hit the hourly limit of ${PER_HOUR} AI requests. This cap exists to keep running costs predictable — try again in a bit.`,
      retryAfterSeconds: 60 * 60,
    };
  }

  if (reflDay + consDay >= PER_DAY) {
    return {
      ok: false,
      error: `You've hit the daily limit of ${PER_DAY} AI requests. This cap exists to keep running costs predictable — try again tomorrow.`,
      retryAfterSeconds: 24 * 60 * 60,
    };
  }

  return { ok: true };
}
