import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { safeDecrypt } from "@/lib/crypto";
import { aiEnabled } from "@/lib/features";
import { checkAiRateLimit } from "@/lib/rateLimit";
import { describeAiError } from "@/lib/aiErrors";
import { buildRecord, reason, type Direction } from "@/lib/reasoning";

// Reason forward from your axioms, or backward from what you did.
//
// Nothing is stored: this is a thinking aid you read once, not another entry
// accumulating in a record that's supposed to be things YOU wrote. If a step
// is worth keeping, it belongs in a reflection you write in your own words.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!aiEnabled()) {
    return NextResponse.json(
      { error: "Reasoning is turned off for this installation." },
      { status: 404 }
    );
  }

  const { direction, situation } = await req.json().catch(() => ({}));
  if (direction !== "forward" && direction !== "backward") {
    return NextResponse.json({ error: "Which direction?" }, { status: 400 });
  }
  if (typeof situation !== "string" || !situation.trim()) {
    return NextResponse.json(
      {
        error:
          direction === "forward"
            ? "Describe the situation in front of you."
            : "Describe what you actually did.",
      },
      { status: 400 }
    );
  }
  if (situation.length > 4000) {
    return NextResponse.json(
      { error: "Keep it under 4,000 characters." },
      { status: 400 }
    );
  }

  const limit = await checkAiRateLimit(userId);
  if (!limit.ok) {
    return NextResponse.json(
      { error: limit.error },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const [axioms, positions, values, decisions] = await Promise.all([
    prisma.axiom.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.position.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.value.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.decision.findMany({
      where: { userId },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
  ]);

  const record = buildRecord({
    axioms: axioms.map((a) => ({ statement: safeDecrypt(a.statement) })),
    positions: positions.map((p) => ({ statement: safeDecrypt(p.statement) })),
    values: values.map((v) => ({
      title: safeDecrypt(v.title),
      body: safeDecrypt(v.body),
    })),
    decisions: decisions.map((d) => ({
      body: safeDecrypt(d.body),
      occurredAt: d.occurredAt,
    })),
  });

  if (record.length === 0) {
    return NextResponse.json(
      {
        error:
          "There's nothing in your record to reason from yet. Take a position apart, or write down a value, first.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await reason(record, direction as Direction, situation.trim());
    return NextResponse.json({
      steps: result.steps,
      model: result.model,
      // Sent back so the client can resolve citations to the real entries and
      // show what each step actually rests on.
      record: record.map((r) => ({ tag: r.tag, kind: r.kind, text: r.text })),
    });
  } catch (err) {
    const failure = describeAiError(err, "reason this through");
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status }
    );
  }
}
