import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { consumeReset, resolveReset } from "@/lib/passwordReset";
import { clearLoginAttempts, clientIp } from "@/lib/loginThrottle";

// Check a token without spending it, so the page can tell someone the link is
// dead before they type a new password into a form that will fail.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const reset = await resolveReset(token);
  return NextResponse.json({ valid: reset !== null });
}

export async function POST(req: Request) {
  const { token, password } = await req.json().catch(() => ({}));

  if (typeof token !== "string" || !token) {
    return NextResponse.json({ error: "That link is missing its code." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const reset = await resolveReset(token);
  if (!reset) {
    return NextResponse.json(
      {
        error:
          "That link has expired or was already used. Ask for a new one — your entries are untouched.",
      },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: reset.userId },
    select: { id: true, email: true },
  });
  if (!user) {
    return NextResponse.json({ error: "That link is no longer valid." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });
  await consumeReset(reset.id, user.id);

  // Someone who just proved control of the address shouldn't be locked out by
  // the failed attempts that sent them here.
  await clearLoginAttempts(user.email, clientIp(req));

  // Sign them in. They've demonstrated control of the account, and making
  // them log in again immediately serves nothing.
  await createSession(user.id);

  return NextResponse.json({ ok: true });
}
