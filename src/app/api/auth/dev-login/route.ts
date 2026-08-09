import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { DEV_AUTOLOGIN, DEV_USER_EMAIL } from "@/lib/dev";

// Dev-only auto-login. Ensures a local dev user exists (seeding a little sample
// data the first time), starts a session, and drops you into the app. Returns
// 404 unless DEV_AUTOLOGIN is explicitly on in a non-production environment.
export async function GET(req: Request) {
  if (!DEV_AUTOLOGIN) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let user = await prisma.user.findUnique({ where: { email: DEV_USER_EMAIL } });

  if (!user) {
    // The dev user can't log in via password (this hash matches nothing);
    // it only exists to hold the auto-login session in local dev.
    user = await prisma.user.create({
      data: { email: DEV_USER_EMAIL, passwordHash: "!dev-account-no-password" },
    });

    // Seed sample data so functionality is visible immediately. Each value
    // gets its first version row so history works from the start.
    const seedValue = async (title: string, body: string) => {
      const encTitle = encrypt(title);
      const encBody = encrypt(body);
      return prisma.value.create({
        data: {
          userId: user!.id,
          title: encTitle,
          body: encBody,
          versions: {
            create: [{ userId: user!.id, title: encTitle, body: encBody }],
          },
        },
      });
    };

    const honesty = await seedValue(
      "Honesty, even when it's costly",
      "I tell the truth even when it hurts me financially or socially."
    );
    const deepWork = await seedValue(
      "Protect my time for deep work",
      "I guard focused hours and say no to things that fragment my attention."
    );
    // Each seeded decision is tagged with the value it bears on — one that
    // lines up with the value, one that sits in tension with it.
    await prisma.decision.create({
      data: {
        userId: user.id,
        body: encrypt(
          "Told a client their project was failing instead of billing more hours."
        ),
        occurredAt: new Date("2026-07-15T00:00:00Z"),
        values: { create: [{ valueId: honesty.id, userId: user.id }] },
      },
    });
    await prisma.decision.create({
      data: {
        userId: user.id,
        body: encrypt(
          "Accepted three back-to-back meetings during my planned deep-work block."
        ),
        occurredAt: new Date("2026-07-22T00:00:00Z"),
        values: { create: [{ valueId: deepWork.id, userId: user.id }] },
      },
    });
  }

  await createSession(user.id);

  const url = new URL("/values", req.url);
  return NextResponse.redirect(url);
}
