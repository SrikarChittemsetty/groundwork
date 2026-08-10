import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt, safeDecrypt } from "@/lib/crypto";
import { generateGuidance } from "@/lib/anthropic";
import { checkAiRateLimit } from "@/lib/rateLimit";
import { describeAiError } from "@/lib/aiErrors";
import { aiEnabled } from "@/lib/features";

// GET: list past consultations (newest first).
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.consultation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  const consultations = rows.map((r) => ({
    id: r.id,
    question: safeDecrypt(r.question),
    body: safeDecrypt(r.body),
    model: r.model,
    createdAt: r.createdAt,
  }));

  return NextResponse.json({ consultations });
}

// POST: run a "what should I do?" query over the user's values + history,
// store it (encrypted), and return it.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { question } = await req.json().catch(() => ({}));
  if (typeof question !== "string" || !question.trim()) {
    return NextResponse.json(
      { error: "Describe the situation you're facing." },
      { status: 400 }
    );
  }
  if (question.length > 4000) {
    return NextResponse.json(
      { error: "Keep the situation under 4000 characters." },
      { status: 400 }
    );
  }

  if (!aiEnabled()) {
    return NextResponse.json(
      { error: "The Ask feature is turned off for this installation." },
      { status: 404 }
    );
  }

  const limit = await checkAiRateLimit(userId);
  if (!limit.ok) {
    return NextResponse.json(
      { error: limit.error },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      }
    );
  }

  const [valueRows, decisionRows] = await Promise.all([
    prisma.value.findMany({ where: { userId } }),
    prisma.decision.findMany({
      where: { userId },
      include: { values: { include: { value: true } } },
    }),
  ]);

  if (valueRows.length === 0) {
    return NextResponse.json(
      {
        error:
          "Add at least one value first — the whole point is to reason from your own values.",
      },
      { status: 400 }
    );
  }

  const values = valueRows.map((v) => ({
    title: safeDecrypt(v.title),
    body: safeDecrypt(v.body),
  }));
  const decisions = decisionRows.map((d) => ({
    body: safeDecrypt(d.body),
    occurredAt: d.occurredAt,
    linkedValueTitles: d.values.map((link) => safeDecrypt(link.value.title)),
  }));

  let result: { text: string; model: string };
  try {
    result = await generateGuidance(values, decisions, question.trim());
  } catch (err) {
    const failure = describeAiError(err, "reason this through");
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status }
    );
  }

  const created = await prisma.consultation.create({
    data: {
      userId,
      question: encrypt(question.trim()),
      body: encrypt(result.text),
      model: result.model,
    },
  });

  return NextResponse.json({
    consultation: {
      id: created.id,
      question: question.trim(),
      body: result.text,
      model: created.model,
      createdAt: created.createdAt,
    },
  });
}
