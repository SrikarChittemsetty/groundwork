import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createReset, RESET_TTL_HOURS } from "@/lib/passwordReset";
import { resetEmail, sendMail } from "@/lib/mail";
import {
  checkLoginThrottle,
  clientIp,
  recordFailedLogin,
} from "@/lib/loginThrottle";

// Ask for a reset link.
//
// The response is identical whether or not the address has an account. An
// endpoint that says "no such user" is a membership oracle, and membership
// here means "this person keeps a journal about their beliefs" — not
// something to confirm to a stranger.
export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));

  const sameAnswer = NextResponse.json({
    ok: true,
    message:
      "If that address has an account, a reset link is on its way. It works once, and expires within the hour.",
  });

  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json(
      { error: "Enter the email address you signed up with." },
      { status: 400 }
    );
  }

  const normalized = email.trim().toLowerCase();
  const ip = clientIp(req);

  // Reuses the sign-in throttle, so this can't become the cheap way to
  // enumerate addresses or spam somebody's inbox.
  const throttle = await checkLoginThrottle(normalized, ip);
  if (throttle.blocked) {
    return NextResponse.json(
      { error: throttle.error },
      {
        status: 429,
        headers: { "Retry-After": String(throttle.retryAfterSeconds) },
      }
    );
  }
  await recordFailedLogin(normalized, ip);

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true },
  });

  // No account: stop here, but answer the same way.
  if (!user) return sameAnswer;

  const token = await createReset(user.id);
  const origin = new URL(req.url).origin;
  const link = `${origin}/reset?token=${token}`;

  const mail = resetEmail(link, RESET_TTL_HOURS);
  await sendMail({ ...mail, to: normalized });

  return sameAnswer;
}
