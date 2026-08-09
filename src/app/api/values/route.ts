import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt, safeDecrypt } from "@/lib/crypto";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.value.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  const values = rows.map((r) => ({
    id: r.id,
    title: safeDecrypt(r.title),
    body: safeDecrypt(r.body),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return NextResponse.json({ values });
}

export async function POST(req: Request) {
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

  // Record the first version alongside the value so history is complete from
  // the very first wording.
  const encTitle = encrypt(title.trim());
  const encBody = encrypt(body.trim());
  const created = await prisma.value.create({
    data: {
      userId,
      title: encTitle,
      body: encBody,
      versions: {
        create: [{ userId, title: encTitle, body: encBody }],
      },
    },
  });

  return NextResponse.json({
    value: {
      id: created.id,
      title: title.trim(),
      body: body.trim(),
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    },
  });
}
