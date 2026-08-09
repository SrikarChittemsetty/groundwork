import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { assertProductionEnv } from "@/lib/env";

// Lightweight session auth: a signed (HS256) JWT stored in an httpOnly cookie.
// Good enough for a single-user / small-scale MVP and cleanly multi-user.

const COOKIE_NAME = "vm_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Generate one with `openssl rand -base64 48`."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: string): Promise<void> {
  // Refuse to mint a session under unsafe production config (placeholder
  // secrets, dev auto-login left on, SQLite on ephemeral hosting).
  assertProductionEnv();

  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecret());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function destroySession(): void {
  cookies().set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// Returns the authenticated userId, or null. Use in route handlers / server
// components. Verification is cryptographic, so it's safe to trust the result.
export async function getUserId(): Promise<string | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
