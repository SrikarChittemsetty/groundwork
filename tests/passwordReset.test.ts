import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { hashToken, hashesMatch, newResetToken } from "@/lib/passwordReset";

// A reset token is a bearer credential for an account holding someone's
// beliefs. These pin the properties that make handing one out survivable:
// it is never stored in usable form, it works once, it dies on schedule, and
// spending one kills its siblings.

const TEST_DB = path.resolve(__dirname, "../prisma/test-reset.db");
const TEST_URL = `file:${TEST_DB}`;

let prisma: PrismaClient;
let userId: string;

beforeAll(async () => {
  rmSync(TEST_DB, { force: true });
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "ignore",
  });
  prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
  userId = (
    await prisma.user.create({
      data: { email: "reset@test.local", passwordHash: "x" },
    })
  ).id;
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(TEST_DB, { force: true });
});

// Mirrors resolveReset() in src/lib/passwordReset.ts.
async function resolve(token: string) {
  const row = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

async function issue(expiresAt?: Date) {
  const token = newResetToken();
  await prisma.passwordReset.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return token;
}

describe("tokens", () => {
  it("has real entropy and is url-safe", () => {
    const t = newResetToken();
    expect(t.length).toBeGreaterThanOrEqual(40);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(newResetToken()).not.toBe(t);
  });

  it("never stores the token itself", async () => {
    const token = await issue();
    const rows = await prisma.passwordReset.findMany({ where: { userId } });
    // The table must not contain anything you could put in a URL.
    expect(rows.some((r) => r.tokenHash === token)).toBe(false);
    expect(rows.some((r) => r.tokenHash === hashToken(token))).toBe(true);
  });

  it("compares hashes without leaking length or prefix by timing", () => {
    const h = hashToken("abc");
    expect(hashesMatch(h, hashToken("abc"))).toBe(true);
    expect(hashesMatch(h, hashToken("abd"))).toBe(false);
    expect(hashesMatch(h, "short")).toBe(false);
  });
});

describe("resolving", () => {
  it("accepts a fresh token", async () => {
    const token = await issue();
    expect(await resolve(token)).not.toBeNull();
  });

  it("rejects an unknown token", async () => {
    expect(await resolve(newResetToken())).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await issue(new Date(Date.now() - 1000));
    expect(await resolve(token)).toBeNull();
  });

  it("rejects a spent token", async () => {
    const token = await issue();
    const row = await resolve(token);
    await prisma.passwordReset.update({
      where: { id: row!.id },
      data: { usedAt: new Date() },
    });
    expect(await resolve(token)).toBeNull();
  });
});

describe("spending one kills the others", () => {
  it("invalidates every outstanding token for that account", async () => {
    await prisma.passwordReset.deleteMany({ where: { userId } });
    const first = await issue();
    const second = await issue();
    const third = await issue();

    // Mirrors consumeReset(): spend one, strand the rest.
    const row = await resolve(first);
    const now = new Date();
    await prisma.$transaction([
      prisma.passwordReset.update({
        where: { id: row!.id },
        data: { usedAt: now },
      }),
      prisma.passwordReset.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      }),
    ]);

    // A second link sitting in an inbox someone else can reach must be dead.
    expect(await resolve(second)).toBeNull();
    expect(await resolve(third)).toBeNull();
  });

  it("strands outstanding links when the password is changed directly", async () => {
    await prisma.passwordReset.deleteMany({ where: { userId } });
    const token = await issue();
    // Mirrors invalidateResetsFor().
    await prisma.passwordReset.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    expect(await resolve(token)).toBeNull();
  });
});

describe("what a reset does not touch", () => {
  it("leaves the person's entries alone — they aren't locked with the password", async () => {
    const value = await prisma.value.create({
      data: { userId, title: "enc-title", body: "enc-body" },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: "a-completely-new-hash" },
    });
    const after = await prisma.value.findUnique({ where: { id: value.id } });
    expect(after?.title).toBe("enc-title");
    expect(after?.body).toBe("enc-body");
  });
});
