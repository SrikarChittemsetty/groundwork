import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

// The single most important invariant in a tool holding people's private
// beliefs: one user's data must be unreachable from another user's session.
// These run against a throwaway SQLite database, never the dev one.

const TEST_DB = path.resolve(__dirname, "../prisma/test.db");
const TEST_URL = `file:${TEST_DB}`;

let prisma: PrismaClient;
let alice: string;
let bob: string;
let aliceValueId: string;

beforeAll(async () => {
  rmSync(TEST_DB, { force: true });
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "ignore",
  });

  prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

  const a = await prisma.user.create({
    data: { email: "alice@test.local", passwordHash: "x" },
  });
  const b = await prisma.user.create({
    data: { email: "bob@test.local", passwordHash: "x" },
  });
  alice = a.id;
  bob = b.id;

  const v = await prisma.value.create({
    data: { userId: alice, title: "enc-title", body: "enc-body" },
  });
  aliceValueId = v.id;
  await prisma.decision.create({
    data: { userId: alice, body: "enc-decision", occurredAt: new Date() },
  });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(TEST_DB, { force: true });
});

describe("per-user scoping", () => {
  it("does not return another user's values", async () => {
    const rows = await prisma.value.findMany({ where: { userId: bob } });
    expect(rows).toHaveLength(0);
  });

  it("does not return another user's decisions", async () => {
    const rows = await prisma.decision.findMany({ where: { userId: bob } });
    expect(rows).toHaveLength(0);
  });

  // Mirrors the API's updateMany({ where: { id, userId } }) pattern.
  it("cannot edit another user's value even with the right id", async () => {
    const res = await prisma.value.updateMany({
      where: { id: aliceValueId, userId: bob },
      data: { title: "hijacked" },
    });
    expect(res.count).toBe(0);
    const still = await prisma.value.findUnique({ where: { id: aliceValueId } });
    expect(still?.title).toBe("enc-title");
  });

  // Mirrors deleteMany({ where: { id, userId } }).
  it("cannot delete another user's value even with the right id", async () => {
    const res = await prisma.value.deleteMany({
      where: { id: aliceValueId, userId: bob },
    });
    expect(res.count).toBe(0);
    expect(
      await prisma.value.findUnique({ where: { id: aliceValueId } })
    ).not.toBeNull();
  });

  it("ownership filter rejects a foreign value id when linking", async () => {
    // Same query ownedValueIds() runs.
    const owned = await prisma.value.findMany({
      where: { userId: bob, id: { in: [aliceValueId] } },
      select: { id: true },
    });
    expect(owned).toHaveLength(0);
  });
});

describe("account deletion", () => {
  // Regression: shares, comments, circle memberships, read markers, and
  // circles you created all used to survive account deletion, because they
  // carried a userId with no relation behind it. Deleting your account left
  // your shared writing sitting in other people's circles — the precise
  // opposite of what "delete everything" promises.
  it("leaves nothing behind anywhere, including shared copies", async () => {
    const doomed = await prisma.user.create({
      data: { email: "cascade@test.local", passwordHash: "x" },
    });
    const bystander = await prisma.user.create({
      data: { email: "bystander@test.local", passwordHash: "x" },
    });

    const circle = await prisma.circle.create({
      data: {
        name: "enc",
        ownerId: doomed.id,
        members: {
          create: [
            { userId: doomed.id, role: "owner" },
            { userId: bystander.id },
          ],
        },
      },
    });
    const share = await prisma.share.create({
      data: { userId: doomed.id, circleId: circle.id, kind: "value", body: "enc" },
    });
    await prisma.shareComment.create({
      data: { shareId: share.id, userId: doomed.id, body: "enc" },
    });
    await prisma.circleRead.create({
      data: { circleId: circle.id, userId: doomed.id },
    });
    await prisma.position.create({
      data: {
        userId: doomed.id,
        statement: "enc",
        nodes: { create: [{ userId: doomed.id, claim: "enc" }] },
      },
    });
    await prisma.axiom.create({ data: { userId: doomed.id, statement: "enc" } });
    await prisma.passwordReset.create({
      data: {
        userId: doomed.id,
        tokenHash: "cascade-hash",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await prisma.user.delete({ where: { id: doomed.id } });

    expect(await prisma.share.count({ where: { userId: doomed.id } })).toBe(0);
    expect(
      await prisma.shareComment.count({ where: { userId: doomed.id } })
    ).toBe(0);
    expect(
      await prisma.circleMember.count({ where: { userId: doomed.id } })
    ).toBe(0);
    expect(await prisma.circleRead.count({ where: { userId: doomed.id } })).toBe(0);
    expect(await prisma.circle.count({ where: { id: circle.id } })).toBe(0);
    expect(await prisma.position.count({ where: { userId: doomed.id } })).toBe(0);
    expect(await prisma.reasonNode.count({ where: { userId: doomed.id } })).toBe(0);
    expect(await prisma.axiom.count({ where: { userId: doomed.id } })).toBe(0);
    expect(
      await prisma.passwordReset.count({ where: { userId: doomed.id } })
    ).toBe(0);

    // The bystander's own account survives; only the shared room went.
    expect(
      await prisma.user.findUnique({ where: { id: bystander.id } })
    ).not.toBeNull();
  });

  it("cascades to every table holding personal data", async () => {
    const doomed = await prisma.user.create({
      data: { email: "doomed@test.local", passwordHash: "x" },
    });
    const val = await prisma.value.create({
      data: {
        userId: doomed.id,
        title: "t",
        body: "b",
        versions: { create: [{ userId: doomed.id, title: "t", body: "b" }] },
      },
    });
    const dec = await prisma.decision.create({
      data: {
        userId: doomed.id,
        body: "d",
        occurredAt: new Date(),
        values: { create: [{ valueId: val.id, userId: doomed.id }] },
      },
    });
    await prisma.reflection.create({
      data: { userId: doomed.id, body: "r", model: "m" },
    });
    await prisma.consultation.create({
      data: { userId: doomed.id, question: "q", body: "b", model: "m" },
    });

    await prisma.user.delete({ where: { id: doomed.id } });

    expect(
      await prisma.value.count({ where: { userId: doomed.id } })
    ).toBe(0);
    expect(
      await prisma.valueVersion.count({ where: { userId: doomed.id } })
    ).toBe(0);
    expect(
      await prisma.decision.count({ where: { userId: doomed.id } })
    ).toBe(0);
    expect(
      await prisma.decisionValue.count({ where: { decisionId: dec.id } })
    ).toBe(0);
    expect(
      await prisma.reflection.count({ where: { userId: doomed.id } })
    ).toBe(0);
    expect(
      await prisma.consultation.count({ where: { userId: doomed.id } })
    ).toBe(0);
  });
});
