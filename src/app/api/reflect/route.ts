import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt, safeDecrypt } from "@/lib/crypto";
import { generateReflection } from "@/lib/anthropic";
import { checkAiRateLimit } from "@/lib/rateLimit";

// GET: list previously generated reflections (newest first).
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.reflection.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  const reflections = rows.map((r) => ({
    id: r.id,
    body: safeDecrypt(r.body),
    model: r.model,
    createdAt: r.createdAt,
  }));

  return NextResponse.json({ reflections });
}

// POST: generate a fresh reflection over the user's current values + decisions,
// store it (encrypted), and return it.
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  if (valueRows.length === 0 && decisionRows.length === 0) {
    return NextResponse.json(
      { error: "Add at least one value or decision before reflecting." },
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
    result = await generateReflection(values, decisions);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate reflection.";
    // Surface config errors (missing key) plainly; keep provider errors generic.
    const status = message.includes("ANTHROPIC_API_KEY") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }

  const created = await prisma.reflection.create({
    data: {
      userId,
      body: encrypt(result.text),
      model: result.model,
    },
  });

  return NextResponse.json({
    reflection: {
      id: created.id,
      body: result.text,
      model: created.model,
      createdAt: created.createdAt,
    },
  });
}
