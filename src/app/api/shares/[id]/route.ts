import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";

// Change what a share reveals, or hide it. Only the person who shared it can
// do either — a circle-mate can read a share but never alter or retract it.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { showBody, showNote, hidden } = await req.json().catch(() => ({}));

  const data: {
    showBody?: boolean;
    showNote?: boolean;
    hiddenAt?: Date | null;
  } = {};
  if (typeof showBody === "boolean") data.showBody = showBody;
  if (typeof showNote === "boolean") data.showNote = showNote;
  if (typeof hidden === "boolean") data.hiddenAt = hidden ? new Date() : null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const result = await prisma.share.updateMany({
    where: { id: params.id, userId },
    data,
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

// Unshare for good. Deletes the shared copy and its comments; your own value
// or decision is untouched.
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await prisma.share.deleteMany({
    where: { id: params.id, userId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
