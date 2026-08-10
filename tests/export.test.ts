import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient, Prisma } from "@prisma/client";

// The privacy page promises you can download "a complete copy of everything."
// That promise has already broken once: the export covered four of the ten
// kinds of entry the app could create, and everything built in the preceding
// stretch of work was silently missing from it.
//
// So there are two tests here. The first writes a distinguishable marker into
// every kind of entry and checks each one comes back out. The second is the
// one that actually holds the line over time: it reads the schema itself and
// fails when a new user-owned model appears that nobody has consciously
// decided about. A test that only checks today's models would pass forever
// while the export fell further behind.

const TEST_DB = path.resolve(__dirname, "../prisma/test-export.db");
const TEST_URL = `file:${TEST_DB}`;

process.env.DATABASE_URL = TEST_URL;

let prisma: PrismaClient;
let buildExport: (userId: string) => Promise<unknown>;
let userId: string;
let exported: string;

beforeAll(async () => {
  rmSync(TEST_DB, { force: true });
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "ignore",
  });
  ({ buildExport } = await import("../src/lib/exportAccount"));
  ({ prisma } = await import("../src/lib/db"));

  const { encrypt } = await import("../src/lib/crypto");
  const e = encrypt;

  const me = await prisma.user.create({
    data: { email: "exporter@test.local", passwordHash: "x" },
  });
  const other = await prisma.user.create({
    data: { email: "other@test.local", passwordHash: "x" },
  });
  userId = me.id;

  const value = await prisma.value.create({
    data: {
      userId,
      title: e("MARK-value-title"),
      body: e("MARK-value-body"),
      versions: {
        create: [
          { userId, title: e("MARK-version-title"), body: e("MARK-version-body") },
        ],
      },
    },
  });
  await prisma.decision.create({
    data: {
      userId,
      body: e("MARK-decision"),
      occurredAt: new Date(),
      values: { create: [{ valueId: value.id, userId }] },
    },
  });
  await prisma.reflection.create({
    data: { userId, body: e("MARK-reflection"), model: "m", source: "self" },
  });
  await prisma.consultation.create({
    data: {
      userId,
      question: e("MARK-consultation-q"),
      body: e("MARK-consultation-body"),
      model: "m",
    },
  });

  const position = await prisma.position.create({
    data: { userId, statement: e("MARK-position") },
  });
  const axiom = await prisma.axiom.create({
    data: { userId, statement: e("MARK-axiom") },
  });
  const axiom2 = await prisma.axiom.create({
    data: { userId, statement: e("MARK-axiom-two") },
  });
  await prisma.reasonNode.create({
    data: {
      positionId: position.id,
      userId,
      claim: e("MARK-reason"),
      isBedrock: true,
      axiomId: axiom.id,
    },
  });
  const [aId, bId] =
    axiom.id < axiom2.id ? [axiom.id, axiom2.id] : [axiom2.id, axiom.id];
  await prisma.axiomTension.create({
    data: {
      userId,
      aId,
      bId,
      note: e("MARK-tension-note"),
      resolution: e("MARK-tension-resolution"),
      resolvedAt: new Date(),
    },
  });

  const circle = await prisma.circle.create({
    data: {
      name: e("MARK-circle"),
      ownerId: userId,
      members: {
        create: [{ userId, role: "owner" }, { userId: other.id }],
      },
    },
  });
  const share = await prisma.share.create({
    data: {
      userId,
      circleId: circle.id,
      kind: "value",
      title: e("MARK-share-title"),
      body: e("MARK-share-body"),
      note: e("MARK-share-note"),
    },
  });
  await prisma.shareComment.create({
    data: { shareId: share.id, userId, body: e("MARK-comment") },
  });

  // Someone else's writing, in a circle we're both in. Must NOT be exported.
  await prisma.shareComment.create({
    data: { shareId: share.id, userId: other.id, body: e("MARK-THEIRS-comment") },
  });
  await prisma.share.create({
    data: {
      userId: other.id,
      circleId: circle.id,
      kind: "value",
      body: e("MARK-THEIRS-share"),
    },
  });

  exported = JSON.stringify(await buildExport(userId));
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(TEST_DB, { force: true });
});

describe("the export is actually complete", () => {
  const shouldAppear = [
    "MARK-value-title",
    "MARK-value-body",
    "MARK-version-title",
    "MARK-decision",
    "MARK-reflection",
    "MARK-consultation-q",
    "MARK-consultation-body",
    "MARK-position",
    "MARK-reason",
    "MARK-axiom",
    "MARK-tension-note",
    "MARK-tension-resolution",
    "MARK-circle",
    "MARK-share-title",
    "MARK-share-body",
    "MARK-share-note",
    "MARK-comment",
  ];

  it("includes every kind of entry you can create", () => {
    const missing = shouldAppear.filter((m) => !exported.includes(m));
    expect(missing).toEqual([]);
  });

  it("comes out decrypted and readable, not as ciphertext", () => {
    expect(exported).not.toContain("v1:");
  });

  it("keeps each reasoning chain attached to its position", async () => {
    const payload = JSON.parse(exported) as {
      positions: { statement: string; reasoning: { claim: string }[] }[];
    };
    const p = payload.positions.find((x) => x.statement === "MARK-position");
    expect(p).toBeDefined();
    expect(p!.reasoning.map((n) => n.claim)).toContain("MARK-reason");
  });

  it("does not hand you other people's writing", () => {
    expect(exported).not.toContain("MARK-THEIRS-comment");
    expect(exported).not.toContain("MARK-THEIRS-share");
  });
});

// This is the test that survives the next six features.
describe("no user-owned model escapes the export unnoticed", () => {
  // Models whose contents reach the export. If you add a model with a userId
  // and it isn't here, this fails — which is the point: the choice to leave
  // something out of "a complete copy of everything" should be a choice.
  const COVERED = new Set([
    "Value",
    "ValueVersion",
    "Decision",
    "DecisionValue",
    "Reflection",
    "Consultation",
    "Position",
    "ReasonNode",
    "Axiom",
    "AxiomTension",
    "Circle",
    "CircleMember",
    "Share",
    "ShareComment",
  ]);

  // Deliberately excluded, with the reason. None of these are your writing.
  const EXCLUDED = new Set([
    "User", // the account row itself; email + createdAt are exported directly
    "LoginAttempt", // throttling metadata, not content
    "PasswordReset", // hashes of spent credentials
    "CircleInvite", // credentials to a room, not writing
    "CircleRead", // a "last opened" timestamp
    "ShareLink", // a credential, same as an invite
  ]);

  it("accounts for every model that stores something of a user's", () => {
    const userOwned = Prisma.dmmf.datamodel.models
      .filter((m) =>
        m.fields.some((f) => f.name === "userId" || f.name === "ownerId")
      )
      .map((m) => m.name);

    const unaccounted = userOwned.filter(
      (name) => !COVERED.has(name) && !EXCLUDED.has(name)
    );
    expect(unaccounted).toEqual([]);
  });

  it("has not quietly dropped a model it used to cover", () => {
    const all = new Set(Prisma.dmmf.datamodel.models.map((m) => m.name));
    const vanished = [...COVERED].filter((name) => !all.has(name));
    expect(vanished).toEqual([]);
  });
});
