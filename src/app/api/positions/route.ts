import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt, safeDecrypt } from "@/lib/crypto";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.position.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { nodes: { select: { id: true, isBedrock: true } } },
  });

  return NextResponse.json({
    positions: rows.map((p) => ({
      id: p.id,
      statement: safeDecrypt(p.statement),
      steps: p.nodes.length,
      // How many chains you actually took all the way down.
      bedrock: p.nodes.filter((n) => n.isBedrock).length,
      settled: p.settledAt !== null,
      createdAt: p.createdAt,
    })),
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
      createdAt: position.createdAt,
    },
  });
}
