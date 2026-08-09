import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt, safeDecrypt } from "@/lib/crypto";
import { generateReflection } from "@/lib/anthropic";
import { checkAiRateLimit } from "@/lib/rateLimit";
import { describeAiError } from "@/lib/aiErrors";

// GET: list previously generated reflections (newest first).
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.reflection.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  const reflections = rows.map((r) => ({
    id: r.id,
    body: safeDecrypt(r.body),
    model: r.model,
    // Older rows predate scoping and carry the literal default.
    scope: r.scope === "Everything" ? "Everything" : safeDecrypt(r.scope),
    createdAt: r.createdAt,
  }));

  return NextResponse.json({ reflections });
}

// POST: generate a fresh reflection over the user's values + decisions, store
// it (encrypted), and return it.
//
// Optionally narrowed by `valueId` (only that value and the decisions tagged
// as bearing on it) or `sinceDays` (only recent decisions). Narrowing exists
// because "everything at once" gets less useful as history grows — but the
// prompt is told when it's seeing a slice, so it can't mistake a filtered gap
// for a real one.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await checkAiRateLimit(userId);
  if (!limit.ok) {
    return NextResponse.json(
      { error: limit.error },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      }
    );
  }

  const { valueId, sinceDays } = await req.json().catch(() => ({}));

  // Resolve the requested scope, always verifying ownership of any id.
  let scopeLabel = "Everything";
  let focusValueId: string | null = null;
  let since: Date | null = null;

  if (typeof valueId === "string" && valueId) {
    const owned = await prisma.value.findFirst({
      where: { id: valueId, userId },
    });
    if (!owned) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    focusValueId = owned.id;
    scopeLabel = safeDecrypt(owned.title);
  } else if (typeof sinceDays === "number" && Number.isFinite(sinceDays)) {
    const days = Math.max(1, Math.min(3650, Math.floor(sinceDays)));
    since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    scopeLabel = `The last ${days} days`;
  }

  const [valueRows, decisionRows] = await Promise.all([
    prisma.value.findMany({
      where: focusValueId ? { userId, id: focusValueId } : { userId },
    }),
    prisma.decision.findMany({
      where: {
        userId,
        ...(since ? { occurredAt: { gte: since } } : {}),
        ...(focusValueId ? { values: { some: { valueId: focusValueId } } } : {}),
      },
      include: { values: { include: { value: true } } },
    }),
  ]);

  if (valueRows.length === 0 && decisionRows.length === 0) {
    return NextResponse.json(
      {
        error:
          scopeLabel === "Everything"
            ? "Add at least one value or decision before reflecting."
            : `Nothing recorded within "${scopeLabel}" yet — try a wider scope.`,
      },
      { status: 400 }
    );
  }

  const values = valueRows.map((v) => ({
    title: safeDecrypt(v.title),
    body: safeDecrypt(v.body),
  }));
  const decisions = decisionRows.map((d) => ({
    body: safeDecrypt(d.body),
    occurredAt: d.occurredAt,
    linkedValueTitles: d.values.map((link) => safeDecrypt(link.value.title)),
  }));

  let result: { text: string; model: string };
  try {
    result = await generateReflection(values, decisions, scopeLabel);
  } catch (err) {
    const failure = describeAiError(err, "generate a reflection");
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status }
    );
  }

  const created = await prisma.reflection.create({
    data: {
      userId,
      body: encrypt(result.text),
      model: result.model,
      // A scope naming a value would leak its wording, so encrypt anything
      // other than the neutral default.
      scope: scopeLabel === "Everything" ? "Everything" : encrypt(scopeLabel),
    },
  });

  return NextResponse.json({
    reflection: {
      id: created.id,
      body: result.text,
      model: created.model,
      scope: scopeLabel,
      createdAt: created.createdAt,
    },
  });
}
