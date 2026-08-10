import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt, safeDecrypt } from "@/lib/crypto";

// Answer a "why?".
//
// `parentId` null means you're answering the position itself; otherwise you're
// answering the node named. Nothing here evaluates your answer — the tool's
// only job is to keep asking.
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const position = await prisma.position.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!position) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { claim, parentId } = await req.json().catch(() => ({}));
  if (typeof claim !== "string" || !claim.trim()) {
    return NextResponse.json({ error: "Answer the question." }, { status: 400 });
  }

  // A parent must belong to this position and this user — you can't graft a
  // reason onto someone else's chain, or onto a different argument.
  if (parentId !== undefined && parentId !== null) {
    if (typeof parentId !== "string") {
      return NextResponse.json({ error: "Bad parent." }, { status: 400 });
    }
    const parent = await prisma.reasonNode.findFirst({
      where: { id: parentId, positionId: position.id, userId },
      select: { id: true, isBedrock: true },
    });
    if (!parent) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (parent.isBedrock) {
      return NextResponse.json(
        {
          error:
            "You marked that as bedrock — nothing goes underneath it. Unmark it first if you've thought of something.",
        },
        { status: 400 }
      );
    }
  }

  const node = await prisma.reasonNode.create({
    data: {
      positionId: position.id,
      userId,
      parentId: typeof parentId === "string" ? parentId : null,
      claim: encrypt(claim.trim()),
    },
  });

  return NextResponse.json({
    node: {
      id: node.id,
      parentId: node.parentId,
      claim: claim.trim(),
      isBedrock: false,
      axiomId: null,
      axiomStatement: null,
      createdAt: node.createdAt,
    },
  });
}

// Mark a node as bedrock, or take the mark off.
//
// Marking bedrock is the moment an axiom is found. You can attach it to an
// axiom you've already reached elsewhere (`axiomId`) — which is how the
// discovery that everything bottoms out in the same few commitments becomes
// visible — or let it register as a new one.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { nodeId, isBedrock, axiomId } = await req.json().catch(() => ({}));
  if (typeof nodeId !== "string" || typeof isBedrock !== "boolean") {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const node = await prisma.reasonNode.findFirst({
    where: { id: nodeId, positionId: params.id, userId },
    include: { children: { select: { id: true } } },
  });
  if (!node) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (isBedrock && node.children.length > 0) {
    return NextResponse.json(
      {
        error:
          "There's already a reason underneath this, so it isn't bedrock. Remove what's below it first.",
      },
      { status: 400 }
    );
  }

  if (!isBedrock) {
    await prisma.reasonNode.update({
      where: { id: node.id },
      data: { isBedrock: false, axiomId: null },
    });
    return NextResponse.json({ ok: true });
  }

  // Linking to an existing axiom, or registering this claim as a new one.
  let linkedAxiomId: string;
  if (typeof axiomId === "string" && axiomId) {
    const existing = await prisma.axiom.findFirst({
      where: { id: axiomId, userId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
    linkedAxiomId = existing.id;
  } else {
    const created = await prisma.axiom.create({
      data: { userId, statement: node.claim },
    });
    linkedAxiomId = created.id;
  }

  await prisma.reasonNode.update({
    where: { id: node.id },
    data: { isBedrock: true, axiomId: linkedAxiomId },
  });

  const axiom = await prisma.axiom.findUnique({ where: { id: linkedAxiomId } });

  return NextResponse.json({
    ok: true,
    axiom: axiom
      ? { id: axiom.id, statement: safeDecrypt(axiom.statement) }
      : null,
  });
}

// Remove a node and everything resting on it.
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { nodeId } = await req.json().catch(() => ({}));
  if (typeof nodeId !== "string") {
    return NextResponse.json({ error: "Which step?" }, { status: 400 });
  }

  const result = await prisma.reasonNode.deleteMany({
    where: { id: nodeId, positionId: params.id, userId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
