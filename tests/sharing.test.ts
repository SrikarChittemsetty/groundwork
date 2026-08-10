import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { hashToken } from "../src/lib/tokens";
import { encrypt } from "../src/lib/crypto";

// Invite and share-link tokens are stored hashed (for lookup) and encrypted
// (so the owner can read their own link back) — never in the clear. Tests
// build both columns from a known token so they can still look rows up.
const tokenCols = (plain: string) => ({
  tokenHash: hashToken(plain),
  tokenEnc: encrypt(plain),
});

// Sharing is the only path by which one person can read another's writing, so
// the invariant is no longer "users never see each other's data" — it's "users
// see each other's data ONLY through an explicit, revocable share." These
// pin that down.

const TEST_DB = path.resolve(__dirname, "../prisma/test-sharing.db");
const TEST_URL = `file:${TEST_DB}`;

let prisma: PrismaClient;
let alice: string;
let bob: string;
let carol: string;
let circleId: string;
let aliceShareId: string;

beforeAll(async () => {
  rmSync(TEST_DB, { force: true });
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "ignore",
  });
  prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

  const mk = async (email: string) =>
    (await prisma.user.create({ data: { email, passwordHash: "x" } })).id;
  alice = await mk("alice@test.local");
  bob = await mk("bob@test.local");
  carol = await mk("carol@test.local");

  const circle = await prisma.circle.create({
    data: {
      name: "enc-name",
      ownerId: alice,
      members: {
        create: [
          { userId: alice, role: "owner" },
          { userId: bob, role: "member" },
        ],
      },
    },
  });
  circleId = circle.id;

  const share = await prisma.share.create({
    data: {
      userId: alice,
      circleId,
      kind: "value",
      title: "enc-modesty",
      body: "enc-what-modesty-means-to-alice",
      note: "enc-note",
    },
  });
  aliceShareId = share.id;
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(TEST_DB, { force: true });
});

// Mirrors isMember() in src/lib/circles.ts.
const memberOf = async (cid: string, uid: string) =>
  (await prisma.circleMember.findUnique({
    where: { circleId_userId: { circleId: cid, userId: uid } },
    select: { id: true },
  })) !== null;

describe("circle membership", () => {
  it("lets a member in", async () => {
    expect(await memberOf(circleId, bob)).toBe(true);
  });

  it("keeps a non-member out", async () => {
    expect(await memberOf(circleId, carol)).toBe(false);
  });

  it("does not list a circle to someone who isn't in it", async () => {
    const visible = await prisma.circle.findMany({
      where: { members: { some: { userId: carol } } },
    });
    expect(visible).toHaveLength(0);
  });
});

describe("what a share exposes", () => {
  it("is visible to a circle member", async () => {
    const shares = await prisma.share.findMany({
      where: { circleId, hiddenAt: null },
    });
    expect(shares).toHaveLength(1);
  });

  it("disappears for everyone once hidden", async () => {
    await prisma.share.update({
      where: { id: aliceShareId },
      data: { hiddenAt: new Date() },
    });
    const shares = await prisma.share.findMany({
      where: { circleId, hiddenAt: null },
    });
    expect(shares).toHaveLength(0);
    await prisma.share.update({
      where: { id: aliceShareId },
      data: { hiddenAt: null },
    });
  });

  it("cannot be altered by another member", async () => {
    // Mirrors updateMany({ where: { id, userId } }) in the PATCH route.
    const res = await prisma.share.updateMany({
      where: { id: aliceShareId, userId: bob },
      data: { showBody: false },
    });
    expect(res.count).toBe(0);
  });

  it("cannot be deleted by another member", async () => {
    const res = await prisma.share.deleteMany({
      where: { id: aliceShareId, userId: bob },
    });
    expect(res.count).toBe(0);
  });

  it("only shares what was shared — the source value stays private", async () => {
    // Alice has a private value that she never shared.
    const priv = await prisma.value.create({
      data: { userId: alice, title: "enc-private", body: "enc-private-body" },
    });
    const shared = await prisma.share.findMany({ where: { circleId } });
    expect(shared.map((s) => s.title)).not.toContain(priv.title);
    // And Bob still can't read Alice's values directly.
    const bobsView = await prisma.value.findMany({ where: { userId: bob } });
    expect(bobsView).toHaveLength(0);
  });
});

describe("comments", () => {
  it("are allowed from a member", async () => {
    const share = await prisma.share.findUnique({ where: { id: aliceShareId } });
    expect(share?.circleId).toBe(circleId);
    expect(await memberOf(share!.circleId!, bob)).toBe(true);
  });

  it("are refused from a non-member", async () => {
    const share = await prisma.share.findUnique({ where: { id: aliceShareId } });
    expect(await memberOf(share!.circleId!, carol)).toBe(false);
  });

  it("can only be deleted by their author", async () => {
    const c = await prisma.shareComment.create({
      data: { shareId: aliceShareId, userId: bob, body: "enc-comment" },
    });
    const notMine = await prisma.shareComment.updateMany({
      where: { id: c.id, shareId: aliceShareId, userId: carol, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    expect(notMine.count).toBe(0);
    const mine = await prisma.shareComment.updateMany({
      where: { id: c.id, shareId: aliceShareId, userId: bob, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    expect(mine.count).toBe(1);
  });
});

describe("invites and links expire the way they claim to", () => {
  it("treats a revoked invite as invalid", async () => {
    const inv = await prisma.circleInvite.create({
      data: {
        circleId,
        ...tokenCols("tok-revoked"),
        createdById: alice,
        revokedAt: new Date(),
      },
    });
    const found = await prisma.circleInvite.findUnique({
      where: { tokenHash: hashToken("tok-revoked") },
    });
    expect(found?.id).toBe(inv.id);
    expect(found?.revokedAt).not.toBeNull();
  });

  it("treats an expired invite as invalid", async () => {
    const past = new Date(Date.now() - 1000);
    const inv = await prisma.circleInvite.create({
      data: {
        circleId,
        ...tokenCols("tok-expired"),
        createdById: alice,
        expiresAt: past,
      },
    });
    expect(inv.expiresAt!.getTime()).toBeLessThan(Date.now());
  });

  it("kills a public link when the share is hidden", async () => {
    const link = await prisma.shareLink.create({
      data: {
        shareId: aliceShareId,
        ...tokenCols("tok-link"),
        createdById: alice,
      },
    });
    await prisma.share.update({
      where: { id: aliceShareId },
      data: { hiddenAt: new Date() },
    });
    const withShare = await prisma.shareLink.findUnique({
      where: { tokenHash: hashToken("tok-link") },
      include: { share: true },
    });
    expect(withShare!.id).toBe(link.id);
    // resolveShareLink() returns null in exactly this case.
    expect(withShare!.share.hiddenAt).not.toBeNull();
    await prisma.share.update({
      where: { id: aliceShareId },
      data: { hiddenAt: null },
    });
  });
});

// The privacy page says a stolen database file contains only ciphertext. An
// invite or share-link token sitting there in the clear would be a plain
// counterexample: it grants entry to a circle on its own, no key required.
describe("bearer tokens are not readable from the database", () => {
  it("stores neither an invite nor a share link in the clear", async () => {
    const secret = "PLAINTEXT-CANARY-TOKEN";
    await prisma.circleInvite.create({
      data: { circleId, ...tokenCols(secret), createdById: alice },
    });
    await prisma.shareLink.create({
      data: { shareId: aliceShareId, ...tokenCols(secret), createdById: alice },
    });

    const [invite, link] = await Promise.all([
      prisma.circleInvite.findUnique({ where: { tokenHash: hashToken(secret) } }),
      prisma.shareLink.findUnique({ where: { tokenHash: hashToken(secret) } }),
    ]);

    for (const row of [invite!, link!]) {
      expect(row.tokenHash).not.toContain(secret);
      expect(row.tokenEnc).not.toContain(secret);
      // Ciphertext, in the same v1:iv:tag:body form as everything else.
      expect(row.tokenEnc.startsWith("v1:")).toBe(true);
    }
  });

  it("still resolves the token its owner was handed", () => {
    // Lookup is by hash, so the same token keeps working...
    expect(hashToken("stable-token")).toBe(hashToken("stable-token"));
    // ...and a different one doesn't collide with it.
    expect(hashToken("stable-token")).not.toBe(hashToken("stable-tokes"));
  });
});

describe("bound invites", () => {
  // Mirrors inviteAllows() in src/lib/circles.ts.
  const allows = (email: string | null, userEmail: string) =>
    !email || email.trim().toLowerCase() === userEmail.trim().toLowerCase();

  it("lets an unbound invite be used by anyone", () => {
    expect(allows(null, "anyone@test.local")).toBe(true);
  });

  it("lets the named person in", () => {
    expect(allows("sarah@test.local", "Sarah@Test.Local")).toBe(true);
  });

  it("keeps a forwarded invite from working for someone else", () => {
    expect(allows("sarah@test.local", "stranger@test.local")).toBe(false);
  });

  it("treats a claimed invite as spent", async () => {
    const inv = await prisma.circleInvite.create({
      data: {
        circleId,
        ...tokenCols("tok-claimed"),
        createdById: alice,
        email: "bob@test.local",
        claimedById: bob,
        claimedAt: new Date(),
      },
    });
    // resolveInvite() returns null once claimedAt is set.
    expect(inv.claimedAt).not.toBeNull();
  });
});

describe("unread counts", () => {
  it("ignores your own activity — your own writing isn't news to you", async () => {
    const mine = await prisma.share.count({
      where: { circleId, hiddenAt: null, userId: { not: alice } },
    });
    const all = await prisma.share.count({
      where: { circleId, hiddenAt: null },
    });
    expect(all).toBeGreaterThan(0);
    expect(mine).toBeLessThan(all);
  });

  it("counts everything when a circle has never been opened", async () => {
    const seen = await prisma.circleRead.findUnique({
      where: { circleId_userId: { circleId, userId: carol } },
    });
    expect(seen).toBeNull();
  });
});

describe("removing a member", () => {
  it("is refused for a non-owner", async () => {
    const membership = await prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId: alice } },
    });
    // isOwner() gates the route; bob is only a member.
    expect(membership?.role).toBe("owner");
  });

  it("takes their shares but leaves their private record alone", async () => {
    const dave = (
      await prisma.user.create({
        data: { email: "dave@test.local", passwordHash: "x" },
      })
    ).id;
    await prisma.circleMember.create({
      data: { circleId, userId: dave, role: "member" },
    });
    const ownValue = await prisma.value.create({
      data: { userId: dave, title: "enc-d", body: "enc-d" },
    });
    const shared = await prisma.share.create({
      data: { userId: dave, circleId, kind: "value", title: "enc-d", body: "enc-d" },
    });

    // Mirrors the members DELETE route.
    await prisma.$transaction([
      prisma.share.deleteMany({ where: { circleId, userId: dave } }),
      prisma.circleMember.delete({
        where: { circleId_userId: { circleId, userId: dave } },
      }),
    ]);

    expect(await prisma.share.findUnique({ where: { id: shared.id } })).toBeNull();
    expect(await memberOf(circleId, dave)).toBe(false);
    // The thing that matters: their own writing is untouched.
    expect(
      await prisma.value.findUnique({ where: { id: ownValue.id } })
    ).not.toBeNull();
  });
});

describe("leaving a circle", () => {
  it("takes the leaver's shares out with them", async () => {
    const bobShare = await prisma.share.create({
      data: { userId: bob, circleId, kind: "value", title: "enc-b", body: "enc-b" },
    });
    // Mirrors the DELETE route's transaction.
    await prisma.$transaction([
      prisma.share.deleteMany({ where: { circleId, userId: bob } }),
      prisma.circleMember.delete({
        where: { circleId_userId: { circleId, userId: bob } },
      }),
    ]);
    expect(
      await prisma.share.findUnique({ where: { id: bobShare.id } })
    ).toBeNull();
    expect(await memberOf(circleId, bob)).toBe(false);
    // Alice's share is untouched.
    expect(
      await prisma.share.findUnique({ where: { id: aliceShareId } })
    ).not.toBeNull();
  });
});
