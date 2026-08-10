import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt, safeDecrypt } from "@/lib/crypto";
import { shiftsUnder, describeShifts } from "@/lib/derive";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.position.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      nodes: {
        select: {
          id: true,
          isBedrock: true,
          // The axioms this argument bottoms out in are what it stands on, so
          // whether they've moved since is part of the position's state.
          axiom: {
            select: {
              id: true,
              statement: true,
              createdAt: true,
              revisedAt: true,
              retiredAt: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    positions: rows.map((p) => {
      // One position can reach the same axiom down two branches; it should
      // only be reported once.
      const restsOn = [
        ...new Map(
          p.nodes
            .filter((n) => n.axiom)
            .map((n) => [
              n.axiom!.id,
              { ...n.axiom!, statement: safeDecrypt(n.axiom!.statement) },
            ])
        ).values(),
      ];
      const shifts = shiftsUnder(
        { id: p.id, settledAt: p.settledAt },
        restsOn
      );

      return {
        id: p.id,
        statement: safeDecrypt(p.statement),
        steps: p.nodes.length,
        // How many chains you actually took all the way down.
        bedrock: p.nodes.filter((n) => n.isBedrock).length,
        settled: p.settledAt !== null,
        restsOn: restsOn.map((a) => ({ id: a.id, statement: a.statement })),
        // Settled, but on ground that has moved since. Not un-settled on the
        // person's behalf — flagged, and they decide.
        inQuestion: shifts.length > 0,
        inQuestionBecause: describeShifts(shifts),
        shifts,
        createdAt: p.createdAt,
      };
    }),
  });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { statement } = await req.json().catch(() => ({}));
  if (typeof statement !== "string" || !statement.trim()) {
    return NextResponse.json(
      { error: "State the position you want to take apart." },
      { status: 400 }
    );
  }

  const position = await prisma.position.create({
    data: { userId, statement: encrypt(statement.trim()) },
  });

  return NextResponse.json({
    position: {
      id: position.id,
      statement: statement.trim(),
      steps: 0,
      bedrock: 0,
      settled: false,
      restsOn: [],
      inQuestion: false,
      inQuestionBecause: "",
      shifts: [],
      createdAt: position.createdAt,
    },
  });
}
