import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";

// A reflection the person wrote themselves.
//
// Deliberately has nothing in common with the AI path: no API key, no rate
// limit, no cost, no network call. Writing down what you notice about your own
// record is the primary use of this tool, not a fallback for when inference
// isn't configured.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body, scope } = await req.json().catch(() => ({}));
  if (typeof body !== "string" || !body.trim()) {
    return NextResponse.json(
      { error: "Write something first." },
      { status: 400 }
    );
  }
  if (body.length > 20000) {
    return NextResponse.json(
      { error: "That's longer than this field holds — keep it under 20,000 characters." },
      { status: 400 }
    );
  }

  // A scope label may name a value, so it's encrypted like everything else.
  const label =
    typeof scope === "string" && scope.trim() && scope !== "Everything"
      ? scope.trim()
      : "Everything";

  const created = await prisma.reflection.create({
    data: {
      userId,
      body: encrypt(body.trim()),
      model: "you",
      source: "self",
      scope: label === "Everything" ? "Everything" : encrypt(label),
    },
  });

  return NextResponse.json({
    reflection: {
      id: created.id,
      body: body.trim(),
      model: "you",
      source: "self",
      scope: label,
      createdAt: created.createdAt,
    },
  });
}
