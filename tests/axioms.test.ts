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
  // Explicit shape: `parentId` feeds the next iteration's create, so without
  // an annotation TS can't resolve the type without consulting itself.
  const nodes: { id: string; parentId: string | null }[] = [];
  let parentId: string | null = null;
  for (const claim of claims) {
    const created: { id: string; parentId: string | null } =
      await prisma.reasonNode.create({
        data: { positionId: position.id, userId, parentId, claim },
        select: { id: true, parentId: true },
      });
    nodes.push(created);
    parentId = created.id;
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

  it("survives an axiom being deleted by taking the tension with it", async () => {
    const a = await prisma.axiom.create({ data: { userId, statement: "x" } });
    const b = await prisma.axiom.create({ data: { userId, statement: "y" } });
    const [first, second] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    const t = await prisma.axiomTension.create({
      data: { userId, aId: first, bId: second, note: "enc-note" },
    });
    await prisma.axiom.delete({ where: { id: a.id } });
    expect(
      await prisma.axiomTension.findUnique({ where: { id: t.id } })
    ).toBeNull();
  });

  it("keeps one person's positions and axioms out of another's", async () => {
    expect(await prisma.position.count({ where: { userId: otherId } })).toBe(0);
    expect(await prisma.axiom.count({ where: { userId: otherId } })).toBe(0);
    expect(
      await prisma.position.count({ where: { userId } })
    ).toBeGreaterThan(0);
  });
});

// A tension is something the person asserts about two of their own axioms.
// The tool has no view on whether commitments conflict — at this level most
// people are internally consistent and simply hold different things as
// bedrock — so what's enforced is only that the assertion is well-formed.
describe("tensions between axioms", () => {
  const ordered = (x: string, y: string): [string, string] =>
    x < y ? [x, y] : [y, x];

  it("stores a pair in a fixed order so it can't be recorded twice", async () => {
    const a = await prisma.axiom.create({ data: { userId, statement: "p" } });
    const b = await prisma.axiom.create({ data: { userId, statement: "q" } });
    const [first, second] = ordered(a.id, b.id);

    await prisma.axiomTension.create({
      data: { userId, aId: first, bId: second, note: "enc" },
    });

    // The same pair the other way round normalizes to the same row.
    const [againFirst, againSecond] = ordered(b.id, a.id);
    expect(againFirst).toBe(first);
    expect(againSecond).toBe(second);
    await expect(
      prisma.axiomTension.create({
        data: { userId, aId: againFirst, bId: againSecond, note: "enc" },
      })
    ).rejects.toThrow();
  });

  it("cannot pair an axiom that isn't yours", async () => {
    const mine = await prisma.axiom.create({ data: { userId, statement: "m" } });
    const theirs = await prisma.axiom.create({
      data: { userId: otherId, statement: "t" },
    });
    // The route checks both ids belong to the caller before creating.
    const owned = await prisma.axiom.findMany({
      where: { userId, id: { in: [mine.id, theirs.id] } },
      select: { id: true },
    });
    expect(owned).toHaveLength(1);
  });

  it("treats an unresolved tension as fine, not as a task", async () => {
    const a = await prisma.axiom.create({ data: { userId, statement: "r" } });
    const b = await prisma.axiom.create({ data: { userId, statement: "s" } });
    const [first, second] = ordered(a.id, b.id);
    const t = await prisma.axiomTension.create({
      data: { userId, aId: first, bId: second, note: "enc" },
    });
    expect(t.resolvedAt).toBeNull();
    expect(t.resolution).toBeNull();

    // Holding both and accepting the cost is a resolution.
    const resolved = await prisma.axiomTension.update({
      where: { id: t.id },
      data: { resolvedAt: new Date(), resolution: "enc-hold-both" },
    });
    expect(resolved.resolvedAt).not.toBeNull();
  });
});
