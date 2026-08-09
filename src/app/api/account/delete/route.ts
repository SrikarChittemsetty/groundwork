import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId, destroySession } from "@/lib/auth";

// User-initiated full account + data deletion. Cascades to values, decisions,
// and reflections via the schema's onDelete: Cascade. This is irreversible by
// design and requires the user to type their email to confirm.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { confirmEmail } = await req.json().catch(() => ({}));
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (
    typeof confirmEmail !== "string" ||
    confirmEmail.trim().toLowerCase() !== user.email
  ) {
    return NextResponse.json(
      { error: "Type your account email exactly to confirm deletion." },
      { status: 400 }
    );
  }

  await prisma.user.delete({ where: { id: userId } });
  destroySession();

  return NextResponse.json({ ok: true });
}
