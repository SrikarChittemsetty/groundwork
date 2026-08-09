import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { findEnvProblems } from "@/lib/env";

// Guards the deploy-time failure mode that is easiest to miss: an app that
// boots happily with placeholder secrets and encrypts real users' beliefs with
// a key published in an example file.

const ORIGINAL = { ...process.env };

function setEnv(env: Record<string, string | undefined>) {
  for (const key of [
    "NODE_ENV",
    "AUTH_SECRET",
    "APP_ENCRYPTION_KEY",
    "DEV_AUTOLOGIN",
    "DATABASE_URL",
  ]) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
}

const GOOD = {
  NODE_ENV: "production",
  AUTH_SECRET: "x".repeat(40),
  APP_ENCRYPTION_KEY: "a".repeat(64),
  DATABASE_URL: "postgresql://user@host:5432/db",
};

beforeEach(() => setEnv(GOOD));
afterEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL);
});

const keys = (p: ReturnType<typeof findEnvProblems>) => p.map((x) => x.key);

describe("production configuration guard", () => {
  it("passes a correctly configured production environment", () => {
    expect(findEnvProblems()).toEqual([]);
  });

  it("rejects placeholder secrets copied from .env.example", () => {
    setEnv({
      ...GOOD,
      AUTH_SECRET: "replace-me-with-a-long-random-string",
      APP_ENCRYPTION_KEY: "replace-me-with-64-hex-chars",
    });
    expect(keys(findEnvProblems())).toEqual(
      expect.arrayContaining(["AUTH_SECRET", "APP_ENCRYPTION_KEY"])
    );
  });

  it("rejects a missing encryption key", () => {
    setEnv({ ...GOOD, APP_ENCRYPTION_KEY: undefined });
    expect(keys(findEnvProblems())).toContain("APP_ENCRYPTION_KEY");
  });

  it("rejects an encryption key that isn't 64 hex chars", () => {
    setEnv({ ...GOOD, APP_ENCRYPTION_KEY: "nothex".repeat(10) });
    expect(keys(findEnvProblems())).toContain("APP_ENCRYPTION_KEY");
  });

  it("rejects a short signing secret", () => {
    setEnv({ ...GOOD, AUTH_SECRET: "tooshort" });
    expect(keys(findEnvProblems())).toContain("AUTH_SECRET");
  });

  it("rejects dev auto-login left enabled in production", () => {
    setEnv({ ...GOOD, DEV_AUTOLOGIN: "true" });
    expect(keys(findEnvProblems())).toContain("DEV_AUTOLOGIN");
  });

  it("rejects SQLite in production, where a redeploy would wipe user data", () => {
    setEnv({ ...GOOD, DATABASE_URL: "file:./dev.db" });
    expect(keys(findEnvProblems())).toContain("DATABASE_URL");
  });

  it("allows dev auto-login and SQLite outside production", () => {
    setEnv({
      NODE_ENV: "development",
      AUTH_SECRET: "x".repeat(40),
      APP_ENCRYPTION_KEY: "a".repeat(64),
      DEV_AUTOLOGIN: "true",
      DATABASE_URL: "file:./dev.db",
    });
    expect(findEnvProblems()).toEqual([]);
  });

  it("never includes secret values in the reported problems", () => {
    setEnv({ ...GOOD, AUTH_SECRET: "supersecretvalue" });
    const serialized = JSON.stringify(findEnvProblems());
    expect(serialized).not.toContain("supersecretvalue");
  });
});
