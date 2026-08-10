import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt, safeDecrypt } from "@/lib/crypto";
import { shiftsUnder } from "@/lib/derive";

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
      versions: { orderBy: { createdAt: "asc" } },
      nodes: {
        include: {
          position: {
            select: { id: true, statement: true, settledAt: true },
          },
        },
      },
    },
  });

  return NextResponse.json({
    axioms: rows.map((a) => {
      // One position can reach the same axiom by more than one branch; the
      // interesting number is distinct positions.
      const positions = new Map(
        a.nodes.map((n) => [
          n.position.id,
          {
            statement: safeDecrypt(n.position.statement),
            settledAt: n.position.settledAt,
          },
        ])
      );
      const self = {
        id: a.id,
        statement: safeDecrypt(a.statement),
        createdAt: a.createdAt,
        revisedAt: a.revisedAt,
        retiredAt: a.retiredAt,
      };
      return {
        id: a.id,
        statement: safeDecrypt(a.statement),
        reachedFrom: [...positions.entries()].map(([id, p]) => ({
          id,
          statement: p.statement,
          // Whether THIS axiom moving is what put that position in question.
          inQuestion:
            shiftsUnder({ id, settledAt: p.settledAt }, [self]).length > 0,
        })),
        // What it used to say, so a reworded axiom still shows the wording the
        // arguments underneath it were actually settled against.
        history: a.versions.map((v) => ({
          statement: safeDecrypt(v.statement),
          createdAt: v.createdAt,
        })),
        revisedAt: a.revisedAt,
        retiredAt: a.retiredAt,
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
      history: [],
      revisedAt: null,
      retiredAt: null,
      createdAt: axiom.createdAt,
    },
  });
}
