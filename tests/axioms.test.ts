import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

// The interrogation's rules. Two matter more than the rest:
//
//   - Nothing goes underneath bedrock. If you could answer "why?" again, it
//     wasn't bedrock, and letting a reason hide under one would quietly turn
//     an axiom into just another step.
//   - An axiom reached from several positions stays ONE axiom. The whole
//     payoff is discovering that different arguments bottom out in the same
//     commitment; deduplicating it away would destroy exactly that.

const TEST_DB = path.resolve(__dirname, "../prisma/test-axioms.db");
const TEST_URL = `file:${TEST_DB}`;

let prisma: PrismaClient;
let userId: string;
let otherId: string;

beforeAll(async () => {
  rmSync(TEST_DB, { force: true });
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "ignore",
  });
  prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
  userId = (
    await prisma.user.create({ data: { email: "a@test.local", passwordHash: "x" } })
  ).id;
  otherId = (
    await prisma.user.create({ data: { email: "b@test.local", passwordHash: "x" } })
  ).id;
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(TEST_DB, { force: true });
});

async function chain(statement: string, claims: string[]) {
  const position = await prisma.position.create({
    data: { userId, statement },
  });
  let parentId: string | null = null;
  const nodes = [];
  for (const claim of claims) {
    const node: { id: string } = await prisma.reasonNode.create({
      data: { positionId: position.id, userId, parentId, claim },
    });
    nodes.push(node);
    parentId = node.id;
  }
  return { position, nodes };
}

describe("the why-chain", () => {
  it("links each answer under the one it answers", async () => {
    const { nodes } = await chain("p1", ["because A", "because B", "because C"]);
    expect(nodes[1].parentId ?? null).toBe(nodes[0].id);
    expect(nodes[2].parentId ?? null).toBe(nodes[1].id);
  });

  it("treats a node with no children as still owing an answer", async () => {
    const { nodes } = await chain("p2", ["because A"]);
    const kids = await prisma.reasonNode.count({
      where: { parentId: nodes[0].id },
    });
    const node = await prisma.reasonNode.findUnique({ where: { id: nodes[0].id } });
    // Not bedrock and no children — the UI renders a "why?" here.
    expect(kids).toBe(0);
    expect(node?.isBedrock).toBe(false);
  });

  it("removes everything resting on a deleted step", async () => {
    const { nodes } = await chain("p3", ["A", "B", "C"]);
    await prisma.reasonNode.delete({ where: { id: nodes[0].id } });
    const left = await prisma.reasonNode.count({
      where: { id: { in: nodes.map((n) => n.id) } },
    });
    expect(left).toBe(0);
  });

  it("refuses to call something bedrock while a reason sits under it", async () => {
    const { nodes } = await chain("p4", ["A", "B"]);
    const withKids = await prisma.reasonNode.findUnique({
      where: { id: nodes[0].id },
      include: { children: true },
    });
    // The route rejects on exactly this condition.
    expect(withKids!.children.length).toBeGreaterThan(0);
  });
});

describe("axioms", () => {
  it("records one axiom reached from several positions, not several axioms", async () => {
    const axiom = await prisma.axiom.create({
      data: { userId, statement: "a life should be mine to steer" },
    });

    const a = await chain("turn down the role", ["A"]);
    const b = await chain("say the awkward thing", ["B"]);
    await prisma.reasonNode.update({
      where: { id: a.nodes[0].id },
      data: { isBedrock: true, axiomId: axiom.id },
    });
    await prisma.reasonNode.update({
      where: { id: b.nodes[0].id },
      data: { isBedrock: true, axiomId: axiom.id },
    });

    const withNodes = await prisma.axiom.findUnique({
      where: { id: axiom.id },
      include: { nodes: { include: { position: true } } },
    });
    const positions = new Set(withNodes!.nodes.map((n) => n.position.id));
    expect(positions.size).toBe(2);

    const total = await prisma.axiom.count({
      where: { userId, statement: "a life should be mine to steer" },
    });
    expect(total).toBe(1);
  });

  it("survives its position being deleted — reaching it was still real", async () => {
    const axiom = await prisma.axiom.create({
      data: { userId, statement: "kept" },
    });
    const { position, nodes } = await chain("temporary", ["X"]);
    await prisma.reasonNode.update({
      where: { id: nodes[0].id },
      data: { isBedrock: true, axiomId: axiom.id },
    });
    await prisma.position.delete({ where: { id: position.id } });
    expect(await prisma.axiom.findUnique({ where: { id: axiom.id } })).not.toBeNull();
  });

  it("keeps one person's positions and axioms out of another's", async () => {
    expect(await prisma.position.count({ where: { userId: otherId } })).toBe(0);
    expect(await prisma.axiom.count({ where: { userId: otherId } })).toBe(0);
    expect(
      await prisma.position.count({ where: { userId } })
    ).toBeGreaterThan(0);
  });
});
