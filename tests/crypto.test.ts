import { describe, it, expect, beforeAll } from "vitest";

// A fixed test key so these tests never depend on the developer's real .env.
const TEST_KEY = "a".repeat(64);

let encrypt: typeof import("@/lib/crypto").encrypt;
let decrypt: typeof import("@/lib/crypto").decrypt;
let safeDecrypt: typeof import("@/lib/crypto").safeDecrypt;

beforeAll(async () => {
  process.env.APP_ENCRYPTION_KEY = TEST_KEY;
  const mod = await import("@/lib/crypto");
  encrypt = mod.encrypt;
  decrypt = mod.decrypt;
  safeDecrypt = mod.safeDecrypt;
});

describe("field encryption", () => {
  it("round-trips text unchanged", () => {
    const plain = "I tell the truth even when it costs me.";
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it("round-trips unicode and newlines", () => {
    const plain = "line one\nline two — em dash, emoji 🙂, quotes “curly”";
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it("round-trips an empty string", () => {
    expect(decrypt(encrypt(""))).toBe("");
  });

  it("never leaves the plaintext visible in the stored value", () => {
    const plain = "billing more hours";
    const stored = encrypt(plain);
    expect(stored).not.toContain(plain);
    expect(stored.startsWith("v1:")).toBe(true);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const plain = "same input";
    expect(encrypt(plain)).not.toBe(encrypt(plain));
  });

  it("rejects tampered ciphertext rather than returning garbage", () => {
    const stored = encrypt("honesty");
    const parts = stored.split(":");
    // Flip a character in the ciphertext segment.
    const data = Buffer.from(parts[3], "base64");
    data[0] = data[0] ^ 0xff;
    parts[3] = data.toString("base64");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });

  it("rejects a tampered auth tag", () => {
    const parts = encrypt("honesty").split(":");
    const tag = Buffer.from(parts[2], "base64");
    tag[0] = tag[0] ^ 0xff;
    parts[2] = tag.toString("base64");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decrypt("not-encrypted-at-all")).toThrow();
    expect(() => decrypt("v2:a:b:c")).toThrow();
  });

  it("safeDecrypt degrades to a marker instead of throwing", () => {
    const out = safeDecrypt("garbage");
    expect(out).toContain("unable to decrypt");
  });
});
