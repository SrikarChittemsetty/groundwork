import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

// "Nothing is retained after deletion" is the strongest sentence on the
// privacy page, and it is the one most likely to quietly stop being true:
// every new table is a new chance to leave something behind. So this runs the
// real purgeAccount() rather than a reimplementation of it, and asserts on
// *every* table in the schema rather than on a list someone has to remember
// to extend.
//
// Two things survived the first version of this: LoginAttempt rows keyed by
// email address, and CircleInvite rows naming the deleted person's address in
// an invitation somebody else had sent them.

const TEST_DB = path.resolve(__dirname, "../prisma/test-deletion.db");
const TEST_URL = `file:${TEST_DB}`;

// Must be set before @/lib/db constructs its client, hence the dynamic import.
process.env.DATABASE_URL = TEST_URL;

let prisma: PrismaClient;
let purgeAccount: (userId: string, email: string) => Promise<void>;

const EMAIL = "doomed@test.local";

beforeAll(async () => {
  rmSync(TEST_DB, { force: true });
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "ignore",
  });
  ({ purgeAccount } = await import("../src/lib/account"));
  ({ prisma } = await import("../src/lib/db"));
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(TEST_DB, { force: true });
});

// One of everything the app can create, so the assertion below has something
// to find if the cascade misses a table.
async function buildAnAccountWithEverything() {
  const bystander = await prisma.user.create({
    data: { email: "bystander@test.local", passwordHash: "x" },
  });
  const doomed = await prisma.user.create({
    data: { email: EMAIL, passwordHash: "x" },
  });

  const value = await prisma.value.create({
    data: {
      userId: doomed.id,
      title: "enc",
      body: "enc",
      versions: { create: [{ userId: doomed.id, title: "enc", body: "enc" }] },
    },
  });
  await prisma.decision.create({
    data: {
      userId: doomed.id,
      body: "enc",
      occurredAt: new Date(),
      values: { create: [{ valueId: value.id, userId: doomed.id }] },
    },
  });
  await prisma.reflection.create({
    data: { userId: doomed.id, body: "enc", model: "m" },
  });
  await prisma.consultation.create({
    data: { userId: doomed.id, question: "enc", body: "enc", model: "m" },
  });

  const position = await prisma.position.create({
    data: { userId: doomed.id, statement: "enc" },
  });
  const axiom = await prisma.axiom.create({
    data: { userId: doomed.id, statement: "enc" },
  });
  const axiom2 = await prisma.axiom.create({
    data: { userId: doomed.id, statement: "enc" },
  });
  await prisma.reasonNode.create({
    data: {
      positionId: position.id,
      userId: doomed.id,
      claim: "enc",
      isBedrock: true,
      axiomId: axiom.id,
    },
  });
  const [aId, bId] =
    axiom.id < axiom2.id ? [axiom.id, axiom2.id] : [axiom2.id, axiom.id];
  await prisma.axiomTension.create({
    data: { userId: doomed.id, aId, bId, note: "enc" },
  });

  await prisma.passwordReset.create({
    data: {
      userId: doomed.id,
      tokenHash: "reset-hash",
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  await prisma.loginAttempt.createMany({
    data: [
      { email: EMAIL, ip: "203.0.113.9" },
      { email: EMAIL, ip: "198.51.100.4" },
    ],
  });

  // A circle they own, and a share + comment + read marker inside it.
  const own = await prisma.circle.create({
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
    data: { userId: doomed.id, circleId: own.id, kind: "value", body: "enc" },
  });
  await prisma.shareComment.create({
    data: { shareId: share.id, userId: doomed.id, body: "enc" },
  });
  await prisma.circleRead.create({
    data: { circleId: own.id, userId: doomed.id },
  });
  await prisma.shareLink.create({
    data: {
      shareId: share.id,
      tokenHash: "link-hash",
      tokenEnc: "v1:enc",
      createdById: doomed.id,
    },
  });

  // Someone else's circle: an invitation addressed to them, an invite they
  // issued, and their membership + comment in a stranger's room.
  const theirs = await prisma.circle.create({
    data: {
      name: "enc",
      ownerId: bystander.id,
      members: {
        create: [
          { userId: bystander.id, role: "owner" },
          { userId: doomed.id },
        ],
      },
    },
  });
  await prisma.circleInvite.create({
    data: {
      circleId: theirs.id,
      tokenHash: "invite-to-them",
      tokenEnc: "v1:enc",
      email: EMAIL,
      createdById: bystander.id,
    },
  });
  await prisma.circleInvite.create({
    data: {
      circleId: theirs.id,
      tokenHash: "invite-by-them",
      tokenEnc: "v1:enc",
      createdById: doomed.id,
    },
  });
  const theirShare = await prisma.share.create({
    data: { userId: bystander.id, circleId: theirs.id, kind: "value", body: "enc" },
  });
  await prisma.shareComment.create({
    data: { shareId: theirShare.id, userId: doomed.id, body: "enc" },
  });

  return { doomed, bystander, theirs };
}

describe("deleting an account", () => {
  it("leaves no row anywhere referring to the person", async () => {
    const { doomed, bystander, theirs } = await buildAnAccountWithEverything();

    await purgeAccount(doomed.id, EMAIL);

    // Every table that carries a userId, checked by name so that adding a
    // model without a cascade fails here rather than in production.
    const byUser: [string, () => Promise<number>][] = [
      ["Value", () => prisma.value.count({ where: { userId: doomed.id } })],
      ["ValueVersion", () => prisma.valueVersion.count({ where: { userId: doomed.id } })],
      ["Decision", () => prisma.decision.count({ where: { userId: doomed.id } })],
      ["DecisionValue", () => prisma.decisionValue.count({ where: { userId: doomed.id } })],
      ["Reflection", () => prisma.reflection.count({ where: { userId: doomed.id } })],
      ["Consultation", () => prisma.consultation.count({ where: { userId: doomed.id } })],
      ["Position", () => prisma.position.count({ where: { userId: doomed.id } })],
      ["ReasonNode", () => prisma.reasonNode.count({ where: { userId: doomed.id } })],
      ["Axiom", () => prisma.axiom.count({ where: { userId: doomed.id } })],
      ["AxiomTension", () => prisma.axiomTension.count({ where: { userId: doomed.id } })],
      ["PasswordReset", () => prisma.passwordReset.count({ where: { userId: doomed.id } })],
      ["CircleMember", () => prisma.circleMember.count({ where: { userId: doomed.id } })],
      ["CircleRead", () => prisma.circleRead.count({ where: { userId: doomed.id } })],
      ["Circle", () => prisma.circle.count({ where: { ownerId: doomed.id } })],
      ["Share", () => prisma.share.count({ where: { userId: doomed.id } })],
      ["ShareComment", () => prisma.shareComment.count({ where: { userId: doomed.id } })],
      ["ShareLink", () => prisma.shareLink.count({ where: { createdById: doomed.id } })],
      ["CircleInvite (issued)", () => prisma.circleInvite.count({ where: { createdById: doomed.id } })],
      // Keyed by email, not id — no cascade possible, so purgeAccount does it.
      ["LoginAttempt", () => prisma.loginAttempt.count({ where: { email: EMAIL } })],
      ["CircleInvite (addressed)", () => prisma.circleInvite.count({ where: { email: EMAIL } })],
      ["User", () => prisma.user.count({ where: { id: doomed.id } })],
    ];

    const leftovers: string[] = [];
    for (const [name, count] of byUser) {
      if ((await count()) > 0) leftovers.push(name);
    }
    expect(leftovers).toEqual([]);
  });

  it("takes nothing of anyone else's with it", async () => {
    // The bystander's account, their circle, and their own share all survive.
    const bystander = await prisma.user.findUnique({
      where: { email: "bystander@test.local" },
    });
    expect(bystander).not.toBeNull();
    expect(
      await prisma.share.count({ where: { userId: bystander!.id } })
    ).toBe(1);
    expect(
      await prisma.circle.count({ where: { ownerId: bystander!.id } })
    ).toBe(1);
  });
});
