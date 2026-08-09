import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

// Application-layer encryption for all sensitive user text (values, decisions,
// reflections). AES-256-GCM gives us confidentiality + integrity (the auth tag
// detects tampering). The key comes from APP_ENCRYPTION_KEY (64 hex chars).
//
// Stored format (a single string safe for a text column):
//   v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>
// The "v1" prefix lets us change the scheme later without ambiguity.

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, recommended for GCM
const PREFIX = "v1";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32`."
    );
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error(
      "APP_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate with `openssl rand -hex 32`."
    );
  }
  cachedKey = key;
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decrypt(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Ciphertext is not in the expected v1 format.");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    ALGO,
    getKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// Convenience: decrypt but never throw for a single bad row — surface a marker
// instead so one corrupt record doesn't blank an entire timeline.
export function safeDecrypt(payload: string): string {
  try {
    return decrypt(payload);
  } catch {
    return "[unable to decrypt — encryption key may have changed]";
  }
}
