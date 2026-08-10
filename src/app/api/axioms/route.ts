import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt, safeDecrypt } from "@/lib/crypto";

// What you've hit bedrock on, and how often.
//
// The count is the interesting part: an axiom reached from one position is a
// terminus, but one reached from six is load-bearing for most of what you
// think. That's a fact about your reasoning, not a score — nothing here is
// better for being higher.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.axiom.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      nodes: {
        include: { position: { select: { id: true, statement: true } } },
      },
    },
  });

  return NextResponse.json({
    axioms: rows.map((a) => {
      // One position can reach the same axiom by more than one branch; the
      // interesting number is distinct positions.
      const positions = new Map(
        a.nodes.map((n) => [n.position.id, safeDecrypt(n.position.statement)])
      );
      return {
        id: a.id,
        statement: safeDecrypt(a.statement),
        reachedFrom: [...positions.entries()].map(([id, statement]) => ({
          id,
          statement,
        })),
        createdAt: a.createdAt,
      };
    }),
  });
}

// State an axiom directly, for when you already know one without having
// argued your way down to it.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { statement } = await req.json().catch(() => ({}));
  if (typeof statement !== "string" || !statement.trim()) {
    return NextResponse.json({ error: "Write it down first." }, { status: 400 });
  }

  const axiom = await prisma.axiom.create({
    data: { userId, statement: encrypt(statement.trim()) },
  });

  return NextResponse.json({
    axiom: {
      id: axiom.id,
      statement: statement.trim(),
      reachedFrom: [],
      createdAt: axiom.createdAt,
    },
  });
}
