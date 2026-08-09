import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { ownedValueIds } from "@/lib/decisions";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body, occurredAt, valueIds } = await req.json().catch(() => ({}));
  if (typeof body !== "string" || !body.trim()) {
    return NextResponse.json(
      { error: "Describe the decision or action you took." },
      { status: 400 }
    );
  }

  const data: { body: string; occurredAt?: Date } = {
    body: encrypt(body.trim()),
  };
  if (typeof occurredAt === "string" && occurredAt.trim()) {
    const parsed = new Date(occurredAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }
    data.occurredAt = parsed;
  }

  const existing = await prisma.decision.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Value links are replaced wholesale: the submitted set is the new truth.
  // Omitting the field entirely leaves existing links untouched.
  const relinking = valueIds !== undefined;
  const linkIds = relinking ? await ownedValueIds(userId, valueIds) : [];

  await prisma.$transaction([
    prisma.decision.update({ where: { id: existing.id }, data }),
    ...(relinking
      ? [
          prisma.decisionValue.deleteMany({ where: { decisionId: existing.id } }),
          prisma.decisionValue.createMany({
            data: linkIds.map((valueId) => ({
              decisionId: existing.id,
              valueId,
              userId,
            })),
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await prisma.decision.deleteMany({
    where: { id: params.id, userId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
