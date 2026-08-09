import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { safeDecrypt } from "@/lib/crypto";

// Full user-initiated data export (decrypted, human-readable JSON). This is a
// non-negotiable from the design principles: the user owns their data and can
// take all of it with them at any time.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      values: { include: { versions: { orderBy: { createdAt: "asc" } } } },
      decisions: { include: { values: { include: { value: true } } } },
      reflections: true,
      consultations: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const payload = {
    exportedAt: new Date().toISOString(),
    account: { email: user.email, createdAt: user.createdAt },
    values: user.values.map((v) => ({
      title: safeDecrypt(v.title),
      body: safeDecrypt(v.body),
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      // Every earlier wording of this value, oldest first.
      history: v.versions.map((ver) => ({
        title: safeDecrypt(ver.title),
        body: safeDecrypt(ver.body),
        createdAt: ver.createdAt,
      })),
    })),
    decisions: user.decisions.map((d) => ({
      body: safeDecrypt(d.body),
      occurredAt: d.occurredAt,
      createdAt: d.createdAt,
      // Values you said this decision bears on.
      bearsOnValues: d.values.map((link) => safeDecrypt(link.value.title)),
    })),
    reflections: user.reflections.map((r) => ({
      body: safeDecrypt(r.body),
      model: r.model,
      createdAt: r.createdAt,
    })),
    consultations: user.consultations.map((c) => ({
      question: safeDecrypt(c.question),
      body: safeDecrypt(c.body),
      model: c.model,
      createdAt: c.createdAt,
    })),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="values-mirror-export.json"',
    },
  });
}
