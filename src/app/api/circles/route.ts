import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt, safeDecrypt } from "@/lib/crypto";
import { circlesFor } from "@/lib/circles";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await circlesFor(userId);

  return NextResponse.json({
    circles: rows.map((c) => ({
      id: c.id,
      name: safeDecrypt(c.name),
      memberCount: c.members.length,
      shareCount: c._count.shares,
      isOwner: c.ownerId === userId,
      createdAt: c.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json().catch(() => ({}));
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "Give the circle a name so you know who's in it." },
      { status: 400 }
    );
  }

  // The creator is a member from the start; a circle you own but aren't in
  // would be a strange thing to have.
  const circle = await prisma.circle.create({
    data: {
      name: encrypt(name.trim()),
      ownerId: userId,
      members: { create: [{ userId, role: "owner" }] },
    },
  });

  return NextResponse.json({
    circle: {
      id: circle.id,
      name: name.trim(),
      memberCount: 1,
      shareCount: 0,
      isOwner: true,
      createdAt: circle.createdAt,
    },
  });
}
