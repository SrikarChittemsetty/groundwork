import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId, destroySession } from "@/lib/auth";
import { purgeAccount } from "@/lib/account";

// User-initiated full account + data deletion. Irreversible by design, and it
// requires the user to type their email to confirm. The removal itself lives
// in purgeAccount() so the tests can exercise the real code path.
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

  await purgeAccount(userId, user.email);
  destroySession();

  return NextResponse.json({ ok: true });
}
