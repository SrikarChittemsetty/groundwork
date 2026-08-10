import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt, safeDecrypt } from "@/lib/crypto";

// Tensions between your own axioms.
//
// Always asserted by you. The tool has no view about whether two of your
// commitments conflict, and shouldn't — at this level most people are
// internally consistent and simply hold different things as bedrock. What it
// can do is show you what rests on each side once you've said there's a pull.

// Pairs are stored in a fixed order so (A,B) and (B,A) are the same row.
function ordered(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.axiomTension.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      a: { include: { nodes: { include: { position: true } } } },
      b: { include: { nodes: { include: { position: true } } } },
    },
  });

  // What actually rests on each side — the stakes of the tension, rather than
  // the tension in the abstract.
  const carries = (axiom: {
    nodes: { position: { id: string; statement: string } }[];
  }) => {
    const seen = new Map<string, string>();
    for (const n of axiom.nodes) {
      seen.set(n.position.id, safeDecrypt(n.position.statement));
    }
    return [...seen.entries()].map(([id, statement]) => ({ id, statement }));
  };

  return NextResponse.json({
    tensions: rows.map((t) => ({
      id: t.id,
      a: {
        id: t.a.id,
        statement: safeDecrypt(t.a.statement),
        carries: carries(t.a),
      },
      b: {
        id: t.b.id,
        statement: safeDecrypt(t.b.statement),
        carries: carries(t.b),
      },
      note: safeDecrypt(t.note),
      resolution: t.resolution ? safeDecrypt(t.resolution) : null,
      resolved: t.resolvedAt !== null,
      createdAt: t.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { aId, bId, note } = await req.json().catch(() => ({}));
  if (typeof aId !== "string" || typeof bId !== "string" || !aId || !bId) {
    return NextResponse.json({ error: "Pick two axioms." }, { status: 400 });
  }
  if (aId === bId) {
    return NextResponse.json(
      { error: "An axiom can't pull against itself." },
      { status: 400 }
    );
  }
  if (typeof note !== "string" || !note.trim()) {
    return NextResponse.json(
      { error: "Say where you think the pull is — that's the part worth keeping." },
      { status: 400 }
    );
  }

  // Both must be yours. Checked together so a foreign id can't be paired with
  // one of your own.
  const owned = await prisma.axiom.findMany({
    where: { userId, id: { in: [aId, bId] } },
    select: { id: true },
  });
  if (owned.length !== 2) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const [first, second] = ordered(aId, bId);

  const existing = await prisma.axiomTension.findUnique({
    where: { aId_bId: { aId: first, bId: second } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You've already noted a pull between those two." },
      { status: 409 }
    );
  }

  const created = await prisma.axiomTension.create({
    data: { userId, aId: first, bId: second, note: encrypt(note.trim()) },
  });

  return NextResponse.json({ tension: { id: created.id } });
}

// Record what you came to — including "I hold both and accept the cost",
// which is a resolution, not a failure to reach one.
export async function PATCH(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, resolution, resolved } = await req.json().catch(() => ({}));
  if (typeof id !== "string") {
    return NextResponse.json({ error: "Which one?" }, { status: 400 });
  }

  const data: {
    resolution?: string | null;
    resolvedAt?: Date | null;
  } = {};
  if (typeof resolution === "string") {
    data.resolution = resolution.trim() ? encrypt(resolution.trim()) : null;
  }
  if (typeof resolved === "boolean") {
    data.resolvedAt = resolved ? new Date() : null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const result = await prisma.axiomTension.updateMany({
    where: { id, userId },
    data,
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string") {
    return NextResponse.json({ error: "Which one?" }, { status: 400 });
  }

  const result = await prisma.axiomTension.deleteMany({ where: { id, userId } });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
