import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import {
  checkLoginThrottle,
  clearLoginAttempts,
  clientIp,
  pruneOldLoginAttempts,
  recordFailedLogin,
} from "@/lib/loginThrottle";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));

  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Email and password required." }, { status: 400 });
  }
  const normalizedEmail = email.trim().toLowerCase();

  const ip = clientIp(req);
  const throttle = await checkLoginThrottle(normalizedEmail, ip);
  if (throttle.blocked) {
    return NextResponse.json(
      { error: throttle.error },
      {
        status: 429,
        headers: { "Retry-After": String(throttle.retryAfterSeconds) },
      }
    );
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  // Compare against a dummy hash when the user is missing so response timing
  // doesn't reveal whether an email is registered.
  const hash =
    user?.passwordHash ??
    "$2a$12$0000000000000000000000000000000000000000000000000000u";
  const ok = await bcrypt.compare(password, hash);

  if (!user || !ok) {
    await recordFailedLogin(normalizedEmail, ip);
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  // A real sign-in clears the throttle so a user who simply mistyped a few
  // times isn't left locked out.
  await clearLoginAttempts(normalizedEmail, ip);
  await pruneOldLoginAttempts();

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
