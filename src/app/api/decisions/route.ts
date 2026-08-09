import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt, safeDecrypt } from "@/lib/crypto";
import { ownedValueIds } from "@/lib/decisions";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.decision.findMany({
    where: { userId },
    orderBy: { occurredAt: "desc" },
    include: { values: { select: { valueId: true } } },
  });

  const decisions = rows.map((r) => ({
    id: r.id,
    body: safeDecrypt(r.body),
    occurredAt: r.occurredAt,
    createdAt: r.createdAt,
    valueIds: r.values.map((v) => v.valueId),
  }));

  return NextResponse.json({ decisions });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body, occurredAt, valueIds } = await req.json().catch(() => ({}));
  if (typeof body !== "string" || !body.trim()) {
    return NextResponse.json(
      { error: "Describe the decision or action you took." },
      { status: 400 }
    );
  }

  // Default to now if no date is given; otherwise validate the provided date.
  let when = new Date();
  if (typeof occurredAt === "string" && occurredAt.trim()) {
    const parsed = new Date(occurredAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }
    when = parsed;
  }

  const linkIds = await ownedValueIds(userId, valueIds);

  const created = await prisma.decision.create({
    data: {
      userId,
      body: encrypt(body.trim()),
      occurredAt: when,
      values: {
        create: linkIds.map((valueId) => ({ valueId, userId })),
      },
    },
  });

  return NextResponse.json({
    decision: {
      id: created.id,
      body: body.trim(),
      occurredAt: created.occurredAt,
      createdAt: created.createdAt,
      valueIds: linkIds,
    },
  });
}
