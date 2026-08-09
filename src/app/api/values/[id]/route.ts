import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt, safeDecrypt } from "@/lib/crypto";

// GET: the value plus its full wording history, oldest first. This is the
// "values then vs. now" view — how a stated value has drifted over time.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const value = await prisma.value.findFirst({
    where: { id: params.id, userId },
    include: { versions: { orderBy: { createdAt: "asc" } } },
  });
  if (!value) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Values created before versioning existed have no rows; fall back to the
  // current wording so history is never empty.
  const versions =
    value.versions.length > 0
      ? value.versions.map((v) => ({
          id: v.id,
          title: safeDecrypt(v.title),
          body: safeDecrypt(v.body),
          createdAt: v.createdAt,
        }))
      : [
          {
            id: value.id,
            title: safeDecrypt(value.title),
            body: safeDecrypt(value.body),
            createdAt: value.createdAt,
          },
        ];

  return NextResponse.json({ versions });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, body } = await req.json().catch(() => ({}));
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "A short title is required." }, { status: 400 });
  }
  if (typeof body !== "string" || !body.trim()) {
    return NextResponse.json(
      { error: "Describe the value in a sentence or two." },
      { status: 400 }
    );
  }

  // Scoped by userId so a user can only edit their own rows.
  const existing = await prisma.value.findFirst({
    where: { id: params.id, userId },
    include: { versions: { orderBy: { createdAt: "asc" }, take: 1 } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const nextTitle = title.trim();
  const nextBody = body.trim();
  const unchanged =
    safeDecrypt(existing.title) === nextTitle &&
    safeDecrypt(existing.body) === nextBody;

  // A no-op save shouldn't clutter the history with an identical version.
  if (unchanged) return NextResponse.json({ ok: true, unchanged: true });

  const encTitle = encrypt(nextTitle);
  const encBody = encrypt(nextBody);

  await prisma.$transaction([
    // Backfill the original wording for values predating versioning, so the
    // first edit doesn't silently lose what was there before.
    ...(existing.versions.length === 0
      ? [
          prisma.valueVersion.create({
            data: {
              valueId: existing.id,
              userId,
              title: existing.title,
              body: existing.body,
              createdAt: existing.createdAt,
            },
          }),
        ]
      : []),
    prisma.value.update({
      where: { id: existing.id },
      data: { title: encTitle, body: encBody },
    }),
    prisma.valueVersion.create({
      data: { valueId: existing.id, userId, title: encTitle, body: encBody },
    }),
  ]);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // deleteMany scoped by userId ensures a user can only delete their own rows.
  const result = await prisma.value.deleteMany({
    where: { id: params.id, userId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
