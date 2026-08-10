import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getUserId, createSession } from "@/lib/auth";
import { invalidateResetsFor } from "@/lib/passwordReset";

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { currentPassword, newPassword } = await req.json().catch(() => ({}));
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return NextResponse.json(
      { error: "Current and new password are required." },
      { status: 400 }
    );
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters." },
      { status: 400 }
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "The new password must be different from the current one." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Requiring the current password means a hijacked session alone can't lock
  // the real owner out of their account.
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { error: "That current password isn't right." },
      { status: 403 }
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) },
  });

  // Any reset link already in an inbox must stop working — otherwise
  // changing your password wouldn't actually shut out whoever prompted it.
  await invalidateResetsFor(user.id);

  // Issue a fresh session so the cookie isn't one minted before the change.
  await createSession(user.id);

  return NextResponse.json({ ok: true });
}
